import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { authAuditLogs, authOtps, userIdentities, users } from "../drizzle/schema.js";
import {
  ENV,
  getSmsProviderMode,
  isTencentSmsConfigured,
} from "./_core/env.js";
import { getDb } from "./db.js";
import { dispatchEmailDelivery } from "./emailNotifications.js";

const OTP_LENGTH = 6;
const OTP_EXPIRES_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

type LoginChannel = "sms" | "email";
type IdentityProvider = "phone_otp" | "email_otp";

export class AuthLoginError extends Error {
  constructor(
    public readonly code:
      | "BAD_REQUEST"
      | "UNAUTHORIZED"
      | "TOO_MANY_REQUESTS"
      | "SERVICE_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "AuthLoginError";
  }
}

function hashOtpCode(input: {
  channel: LoginChannel;
  purpose: string;
  target: string;
  code: string;
}) {
  return createHash("sha256")
    .update(
      `${ENV.cookieSecret || "learnflow-auth"}:${input.channel}:${input.purpose}:${input.target}:${input.code}`
    )
    .digest("hex");
}

export function normalizeEmailAddress(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthLoginError("BAD_REQUEST", "请输入有效的邮箱地址");
  }
  return normalized;
}

export function normalizePhoneNumber(phone: string) {
  const compact = phone.replace(/[\s\-()]/g, "");
  if (/^1\d{10}$/.test(compact)) {
    return `+86${compact}`;
  }
  if (/^86\d{11}$/.test(compact)) {
    return `+${compact}`;
  }
  if (/^\+\d{8,15}$/.test(compact)) {
    return compact;
  }
  throw new AuthLoginError("BAD_REQUEST", "请输入有效的手机号");
}

export function buildLocalOpenId(provider: IdentityProvider, target: string) {
  const label = provider.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  const digest = createHash("sha256").update(`${provider}:${target}`).digest("hex").slice(0, 48);
  return `local_${label}_${digest}`;
}

function buildOneTimeCode() {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function deriveDisplayNameFromTarget(channel: LoginChannel, target: string) {
  if (channel === "email") {
    return target.split("@")[0] || target;
  }
  return target;
}

async function appendAuthAuditLog(input: {
  userId?: number | null;
  identityId?: number | null;
  eventType: string;
  channel?: string | null;
  target?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(authAuditLogs).values({
    userId: input.userId ?? null,
    identityId: input.identityId ?? null,
    eventType: input.eventType,
    channel: input.channel ?? null,
    target: input.target ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    success: input.success ?? true,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  });
}

async function getLatestOtp(channel: LoginChannel, purpose: string, target: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(authOtps)
    .where(
      and(
        eq(authOtps.channel, channel),
        eq(authOtps.purpose, purpose),
        eq(authOtps.target, target)
      )
    )
    .orderBy(desc(authOtps.createdAt))
    .limit(1);
  return row ?? null;
}

async function persistOtpChallenge(input: {
  channel: LoginChannel;
  purpose: string;
  target: string;
  code: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "数据库尚未配置，暂时无法发送验证码");
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRES_MINUTES * 60 * 1000);
  await db.insert(authOtps).values({
    channel: input.channel,
    purpose: input.purpose,
    target: input.target,
    codeHash: hashOtpCode(input),
    expiresAt,
    attemptCount: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    requestIp: input.requestIp ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { expiresAt };
}

async function deliverTencentPhoneCode(target: string, code: string) {
  if (!isTencentSmsConfigured()) {
    throw new AuthLoginError(
      "SERVICE_UNAVAILABLE",
      "腾讯云短信尚未配置完成，请补齐 SecretId、SecretKey、Region、SdkAppId、签名和模板 ID"
    );
  }

  const tencentcloud = await import("tencentcloud-sdk-nodejs");
  const SmsClient = tencentcloud.sms.v20210111.Client;
  const client = new SmsClient({
    credential: {
      secretId: ENV.tencentSmsSecretId,
      secretKey: ENV.tencentSmsSecretKey,
    },
    region: ENV.tencentSmsRegion,
    profile: {
      httpProfile: {
        endpoint: "sms.tencentcloudapi.com",
      },
    },
  });

  const response = await client.SendSms({
    SmsSdkAppId: ENV.tencentSmsSdkAppId,
    SignName: ENV.tencentSmsSignName,
    TemplateId: ENV.tencentSmsTemplateIdLogin,
    PhoneNumberSet: [target],
    TemplateParamSet: [code, String(OTP_EXPIRES_MINUTES)],
    SessionContext: JSON.stringify({
      purpose: "login",
      channel: "sms",
    }),
  });

  const sendStatus = response.SendStatusSet?.[0];
  if (!sendStatus || sendStatus.Code !== "Ok") {
    throw new AuthLoginError(
      "SERVICE_UNAVAILABLE",
      sendStatus?.Message || "腾讯云短信发送失败，请检查签名、模板和号码格式"
    );
  }

  return {
    provider: "tencent" as const,
    requestId: response.RequestId ?? null,
    serialNo: sendStatus.SerialNo ?? null,
  };
}

async function deliverPhoneCode(target: string, code: string) {
  const mode = getSmsProviderMode();
  if (mode === "log") {
    console.info("[SmsDelivery][log]", {
      to: target,
      code,
      purpose: "login",
    });
    return { provider: "log" as const };
  }
  if (mode === "tencent") {
    return deliverTencentPhoneCode(target, code);
  }
  throw new AuthLoginError(
    "SERVICE_UNAVAILABLE",
    "短信验证码尚未配置，请先设置 SMS_PROVIDER=log（开发）或接入正式短信服务"
  );
}

async function deliverEmailCode(target: string, code: string) {
  const subject = `LearnFlow 登录验证码：${code}`;
  const text = [
    `你的 LearnFlow 登录验证码是：${code}`,
    `验证码 ${OTP_EXPIRES_MINUTES} 分钟内有效。`,
    "如果这不是你的操作，请忽略这封邮件。",
  ].join("\n");
  const html = `<div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7">
  <h2 style="margin:0 0 12px">LearnFlow 登录验证码</h2>
  <p>你的验证码是：<strong style="font-size:24px;letter-spacing:4px">${code}</strong></p>
  <p>验证码 <strong>${OTP_EXPIRES_MINUTES} 分钟</strong> 内有效。</p>
  <p>如果这不是你的操作，请忽略这封邮件。</p>
</div>`;

  const result = await dispatchEmailDelivery({
    to: target,
    subject,
    text,
    html,
    eventType: "auth.login.email_otp",
    payload: { target },
  });

  if (!result.ok) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", result.message);
  }

  return { provider: result.provider };
}

async function issueLoginCode(input: {
  channel: LoginChannel;
  target: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const latest = await getLatestOtp(input.channel, "login", input.target);
  if (latest?.createdAt) {
    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(latest.createdAt).getTime()) / 1000
    );
    if (elapsedSeconds < OTP_COOLDOWN_SECONDS) {
      throw new AuthLoginError(
        "TOO_MANY_REQUESTS",
        `请求过于频繁，请在 ${OTP_COOLDOWN_SECONDS - elapsedSeconds} 秒后重试`
      );
    }
  }

  const code = buildOneTimeCode();
  const persisted = await persistOtpChallenge({
    channel: input.channel,
    purpose: "login",
    target: input.target,
    code,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });

  if (input.channel === "sms") {
    await deliverPhoneCode(input.target, code);
  } else {
    await deliverEmailCode(input.target, code);
  }

  await appendAuthAuditLog({
    eventType: "auth.otp.sent",
    channel: input.channel,
    target: input.target,
    ipAddress: input.requestIp,
    userAgent: input.userAgent,
    success: true,
  });

  return {
    cooldownSeconds: OTP_COOLDOWN_SECONDS,
    expiresAt: persisted.expiresAt,
  };
}

async function verifyLoginCode(input: {
  channel: LoginChannel;
  target: string;
  code: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "数据库尚未配置，暂时无法校验验证码");
  }

  const [challenge] = await db
    .select()
    .from(authOtps)
    .where(
      and(
        eq(authOtps.channel, input.channel),
        eq(authOtps.purpose, "login"),
        eq(authOtps.target, input.target),
        isNull(authOtps.consumedAt)
      )
    )
    .orderBy(desc(authOtps.createdAt))
    .limit(1);

  if (!challenge) {
    await appendAuthAuditLog({
      eventType: "auth.otp.verify",
      channel: input.channel,
      target: input.target,
      ipAddress: input.requestIp,
      userAgent: input.userAgent,
      success: false,
      errorCode: "challenge_not_found",
      errorMessage: "No active OTP challenge",
    });
    throw new AuthLoginError("UNAUTHORIZED", "验证码不存在或已失效");
  }

  if (challenge.expiresAt && new Date(challenge.expiresAt).getTime() < Date.now()) {
    await appendAuthAuditLog({
      eventType: "auth.otp.verify",
      channel: input.channel,
      target: input.target,
      ipAddress: input.requestIp,
      userAgent: input.userAgent,
      success: false,
      errorCode: "challenge_expired",
      errorMessage: "OTP challenge expired",
    });
    throw new AuthLoginError("UNAUTHORIZED", "验证码已过期，请重新获取");
  }

  if ((challenge.attemptCount ?? 0) >= (challenge.maxAttempts ?? OTP_MAX_ATTEMPTS)) {
    throw new AuthLoginError("UNAUTHORIZED", "验证码尝试次数过多，请重新获取");
  }

  const expectedHash = hashOtpCode({
    channel: input.channel,
    purpose: "login",
    target: input.target,
    code: input.code,
  });

  if (expectedHash !== challenge.codeHash) {
    await db
      .update(authOtps)
      .set({ attemptCount: (challenge.attemptCount ?? 0) + 1 })
      .where(eq(authOtps.id, challenge.id));
    await appendAuthAuditLog({
      eventType: "auth.otp.verify",
      channel: input.channel,
      target: input.target,
      ipAddress: input.requestIp,
      userAgent: input.userAgent,
      success: false,
      errorCode: "code_mismatch",
      errorMessage: "OTP code mismatch",
    });
    throw new AuthLoginError("UNAUTHORIZED", "验证码错误");
  }

  await db
    .update(authOtps)
    .set({ consumedAt: new Date() })
    .where(eq(authOtps.id, challenge.id));

  return challenge;
}

async function findIdentity(provider: IdentityProvider, target: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.providerUserId, target)
      )
    )
    .limit(1);
  return row ?? null;
}

async function ensureIdentityBinding(input: {
  provider: IdentityProvider;
  target: string;
  userId: number;
  verifiedAt: Date;
}) {
  const db = await getDb();
  if (!db) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "数据库尚未配置");
  }
  const existing = await findIdentity(input.provider, input.target);
  if (existing) {
    await db
      .update(userIdentities)
      .set({
        verifiedAt: input.verifiedAt,
        lastUsedAt: input.verifiedAt,
      })
      .where(eq(userIdentities.id, existing.id));
    return existing.id;
  }

  await db.insert(userIdentities).values({
    userId: input.userId,
    provider: input.provider,
    providerUserId: input.target,
    email: input.provider === "email_otp" ? input.target : null,
    phone: input.provider === "phone_otp" ? input.target : null,
    verifiedAt: input.verifiedAt,
    lastUsedAt: input.verifiedAt,
  });
  const inserted = await findIdentity(input.provider, input.target);
  return inserted?.id ?? null;
}

async function findUserByVerifiedTarget(channel: LoginChannel, target: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] =
    channel === "email"
      ? await db.select().from(users).where(eq(users.email, target)).limit(1)
      : await db.select().from(users).where(eq(users.phone, target)).limit(1);
  return row ?? null;
}

async function createLocalUser(input: {
  channel: LoginChannel;
  target: string;
  now: Date;
}) {
  const db = await getDb();
  if (!db) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "数据库尚未配置");
  }

  const provider: IdentityProvider =
    input.channel === "email" ? "email_otp" : "phone_otp";
  const openId = buildLocalOpenId(provider, input.target);
  await db.insert(users).values({
    openId,
    name: deriveDisplayNameFromTarget(input.channel, input.target),
    email: input.channel === "email" ? input.target : null,
    phone: input.channel === "sms" ? input.target : null,
    emailVerifiedAt: input.channel === "email" ? input.now : null,
    phoneVerifiedAt: input.channel === "sms" ? input.now : null,
    loginMethod: provider,
    status: "active",
    sessionVersion: 0,
    lastSignedIn: input.now,
  });
  const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!user) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "创建本地账号失败");
  }
  return user;
}

async function resolveUserForIdentity(input: {
  channel: LoginChannel;
  target: string;
}) {
  const provider: IdentityProvider =
    input.channel === "email" ? "email_otp" : "phone_otp";
  const identity = await findIdentity(provider, input.target);
  const db = await getDb();
  if (!db) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "数据库尚未配置");
  }

  if (identity) {
    const [user] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);
    if (!user) {
      throw new AuthLoginError("SERVICE_UNAVAILABLE", "绑定身份存在，但本地账号已缺失");
    }
    return user;
  }

  const existingUser = await findUserByVerifiedTarget(input.channel, input.target);
  if (existingUser) {
    return existingUser;
  }

  return createLocalUser({
    channel: input.channel,
    target: input.target,
    now: new Date(),
  });
}

async function finalizeOtpLogin(input: {
  channel: LoginChannel;
  target: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "数据库尚未配置");
  }
  const now = new Date();
  const user = await resolveUserForIdentity({
    channel: input.channel,
    target: input.target,
  });

  await db
    .update(users)
    .set({
      email: input.channel === "email" ? input.target : user.email,
      phone: input.channel === "sms" ? input.target : user.phone,
      emailVerifiedAt: input.channel === "email" ? now : user.emailVerifiedAt,
      phoneVerifiedAt: input.channel === "sms" ? now : user.phoneVerifiedAt,
      loginMethod: input.channel === "email" ? "email_otp" : "phone_otp",
      lastSignedIn: now,
    })
    .where(eq(users.id, user.id));

  const identityId = await ensureIdentityBinding({
    provider: input.channel === "email" ? "email_otp" : "phone_otp",
    target: input.target,
    userId: user.id,
    verifiedAt: now,
  });

  const [freshUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!freshUser) {
    throw new AuthLoginError("SERVICE_UNAVAILABLE", "登录后读取用户失败");
  }

  await appendAuthAuditLog({
    userId: freshUser.id,
    identityId,
    eventType: "auth.login.success",
    channel: input.channel,
    target: input.target,
    ipAddress: input.requestIp,
    userAgent: input.userAgent,
    success: true,
  });

  return freshUser;
}

export async function sendPhoneLoginCode(input: {
  phone: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const phone = normalizePhoneNumber(input.phone);
  return issueLoginCode({
    channel: "sms",
    target: phone,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });
}

export async function sendEmailLoginCode(input: {
  email: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const email = normalizeEmailAddress(input.email);
  return issueLoginCode({
    channel: "email",
    target: email,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });
}

export async function verifyPhoneLoginCode(input: {
  phone: string;
  code: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const phone = normalizePhoneNumber(input.phone);
  await verifyLoginCode({
    channel: "sms",
    target: phone,
    code: input.code.trim(),
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });
  return finalizeOtpLogin({
    channel: "sms",
    target: phone,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });
}

export async function verifyEmailLoginCode(input: {
  email: string;
  code: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  const email = normalizeEmailAddress(input.email);
  await verifyLoginCode({
    channel: "email",
    target: email,
    code: input.code.trim(),
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });
  return finalizeOtpLogin({
    channel: "email",
    target: email,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
  });
}
