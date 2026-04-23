import { createHash, randomUUID } from "node:crypto";
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { AXIOS_TIMEOUT_MS } from "../shared/const.js";
import { authAuditLogs, userIdentities, users } from "../drizzle/schema.js";
import { ENV, isWeChatLoginReady } from "./_core/env.js";
import { getDb, getUserById } from "./db.js";

const WECHAT_PROVIDER = "wechat_open";
const WECHAT_STATE_TTL_MS = 10 * 60 * 1000;

type WeChatTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

type WeChatUserInfoResponse = {
  openid?: string;
  nickname?: string;
  headimgurl?: string;
  unionid?: string;
  country?: string;
  province?: string;
  city?: string;
  errcode?: number;
  errmsg?: string;
};

type WeChatProfile = {
  openId: string;
  unionId: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
};

type WeChatStatePayload = {
  redirectTarget: string;
  nonce: string;
  provider: typeof WECHAT_PROVIDER;
};

export class WeChatAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "wechat_auth_failed"
  ) {
    super(message);
    this.name = "WeChatAuthError";
  }
}

function getStateSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "learnflow-wechat-state");
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "serialization_failed" });
  }
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function appendWeChatAuditLog(input: {
  userId?: number | null;
  identityId?: number | null;
  eventType: string;
  success?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  target?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(authAuditLogs).values({
    userId: input.userId ?? null,
    identityId: input.identityId ?? null,
    eventType: input.eventType,
    channel: "wechat",
    target: input.target ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    success: input.success ?? true,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  });
}

export function buildWeChatLocalOpenId(openId: string, unionId?: string | null) {
  const subject = (unionId || openId).trim();
  const digest = createHash("sha256")
    .update(`${ENV.wechatLoginAppId}:${subject}`)
    .digest("hex")
    .slice(0, 52);
  return `wechat_${digest}`;
}

export async function createWeChatLoginState(redirectTarget: string) {
  const now = Date.now();
  return new SignJWT({
    redirectTarget,
    nonce: randomUUID(),
    provider: WECHAT_PROVIDER,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + WECHAT_STATE_TTL_MS) / 1000))
    .sign(getStateSecret());
}

export async function verifyWeChatLoginState(state: string) {
  try {
    const { payload } = await jwtVerify(state, getStateSecret(), {
      algorithms: ["HS256"],
    });
    const redirectTarget =
      typeof payload.redirectTarget === "string" &&
      payload.redirectTarget.startsWith("/") &&
      !payload.redirectTarget.startsWith("//")
        ? payload.redirectTarget
        : "/";
    if (payload.provider !== WECHAT_PROVIDER) {
      throw new Error("wechat_state_provider_mismatch");
    }
    return {
      redirectTarget,
      nonce:
        typeof payload.nonce === "string" && payload.nonce
          ? payload.nonce
          : randomUUID(),
      provider: WECHAT_PROVIDER,
    } satisfies WeChatStatePayload;
  } catch (error) {
    throw new WeChatAuthError(
      400,
      "WeChat login state is invalid or expired. Please try again.",
      "wechat_state_invalid"
    );
  }
}

export function buildWeChatLoginUrl(state: string, redirectUri: string) {
  const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
  url.searchParams.set("appid", ENV.wechatLoginAppId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_login");
  url.searchParams.set("state", state);
  return `${url.toString()}#wechat_redirect`;
}

export function isWeChatLoginConfigured() {
  return isWeChatLoginReady();
}

async function exchangeWeChatCodeForToken(code: string) {
  const { data } = await axios.get<WeChatTokenResponse>(
    "https://api.weixin.qq.com/sns/oauth2/access_token",
    {
      params: {
        appid: ENV.wechatLoginAppId,
        secret: ENV.wechatLoginAppSecret,
        code,
        grant_type: "authorization_code",
      },
      timeout: AXIOS_TIMEOUT_MS,
    }
  );

  if (data.errcode || !data.access_token || !data.openid) {
    throw new WeChatAuthError(
      502,
      data.errmsg || "Failed to exchange WeChat login code.",
      data.errcode ? String(data.errcode) : "wechat_token_exchange_failed"
    );
  }

  return data;
}

async function fetchWeChatUserInfo(token: WeChatTokenResponse) {
  try {
    const { data } = await axios.get<WeChatUserInfoResponse>(
      "https://api.weixin.qq.com/sns/userinfo",
      {
        params: {
          access_token: token.access_token,
          openid: token.openid,
          lang: "zh_CN",
        },
        timeout: AXIOS_TIMEOUT_MS,
      }
    );

    if (data.errcode) {
      console.warn("[WeChatAuth] Failed to fetch user profile", {
        errcode: data.errcode,
        errmsg: data.errmsg,
      });
      return null;
    }

    return data;
  } catch (error) {
    console.warn("[WeChatAuth] User info request failed", error);
    return null;
  }
}

function buildWeChatProfile(
  token: WeChatTokenResponse,
  userInfo: WeChatUserInfoResponse | null
) {
  return {
    openId: token.openid!,
    unionId: normalizeOptionalText(userInfo?.unionid) || normalizeOptionalText(token.unionid),
    nickname: normalizeOptionalText(userInfo?.nickname) || "WeChat User",
    avatarUrl: normalizeOptionalText(userInfo?.headimgurl),
    country: normalizeOptionalText(userInfo?.country),
    province: normalizeOptionalText(userInfo?.province),
    city: normalizeOptionalText(userInfo?.city),
  } satisfies WeChatProfile;
}

async function findWeChatIdentityByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, WECHAT_PROVIDER),
        eq(userIdentities.providerUserId, openId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function findAnyIdentityByUnionId(unionId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(eq(userIdentities.providerUnionId, unionId))
    .limit(1);
  return row ?? null;
}

async function createWeChatUser(profile: WeChatProfile, now: Date) {
  const db = await getDb();
  if (!db) {
    throw new WeChatAuthError(
      503,
      "Database is not ready, so WeChat login cannot complete.",
      "db_unavailable"
    );
  }

  const localOpenId = buildWeChatLocalOpenId(profile.openId, profile.unionId);
  await db.insert(users).values({
    openId: localOpenId,
    name: profile.nickname,
    avatarUrl: profile.avatarUrl,
    loginMethod: WECHAT_PROVIDER,
    status: "active",
    sessionVersion: 0,
    lastSignedIn: now,
  });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.openId, localOpenId))
    .limit(1);

  if (!user) {
    throw new WeChatAuthError(
      500,
      "The local account was not created after WeChat login.",
      "user_create_failed"
    );
  }

  return user;
}

async function upsertWeChatIdentity(
  userId: number,
  profile: WeChatProfile,
  now: Date
) {
  const db = await getDb();
  if (!db) return null;

  const metadata = safeJsonStringify({
    source: WECHAT_PROVIDER,
    country: profile.country,
    province: profile.province,
    city: profile.city,
  });

  const existing = await findWeChatIdentityByOpenId(profile.openId);
  if (existing) {
    await db
      .update(userIdentities)
      .set({
        userId,
        providerUnionId: profile.unionId,
        displayName: profile.nickname,
        avatarUrl: profile.avatarUrl,
        verifiedAt: now,
        lastUsedAt: now,
        metadata,
      })
      .where(eq(userIdentities.id, existing.id));
    return existing.id;
  }

  await db.insert(userIdentities).values({
    userId,
    provider: WECHAT_PROVIDER,
    providerUserId: profile.openId,
    providerUnionId: profile.unionId,
    displayName: profile.nickname,
    avatarUrl: profile.avatarUrl,
    verifiedAt: now,
    lastUsedAt: now,
    metadata,
  });

  const inserted = await findWeChatIdentityByOpenId(profile.openId);
  return inserted?.id ?? null;
}

async function resolveWeChatUser(profile: WeChatProfile, now: Date) {
  const exactIdentity = await findWeChatIdentityByOpenId(profile.openId);
  if (exactIdentity) {
    const user = await getUserById(exactIdentity.userId);
    if (!user) {
      throw new WeChatAuthError(
        500,
        "A bound WeChat identity exists, but its local account is missing.",
        "identity_user_missing"
      );
    }
    return user;
  }

  if (profile.unionId) {
    const unionMatch = await findAnyIdentityByUnionId(profile.unionId);
    if (unionMatch) {
      const user = await getUserById(unionMatch.userId);
      if (user) return user;
    }
  }

  return createWeChatUser(profile, now);
}

function shouldRefreshUserName(existingName: string | null, loginMethod: string | null) {
  return !existingName || loginMethod === WECHAT_PROVIDER;
}

function shouldRefreshUserAvatar(existingAvatarUrl: string | null, loginMethod: string | null) {
  return !existingAvatarUrl || loginMethod === WECHAT_PROVIDER;
}

export async function completeWeChatLogin(input: {
  code: string;
  state: string;
  requestIp?: string | null;
  userAgent?: string | null;
}) {
  if (!isWeChatLoginConfigured()) {
    throw new WeChatAuthError(
      503,
      "WeChat login is not configured yet.",
      "wechat_not_configured"
    );
  }

  const statePayload = await verifyWeChatLoginState(input.state);
  const token = await exchangeWeChatCodeForToken(input.code);
  const userInfo = await fetchWeChatUserInfo(token);
  const profile = buildWeChatProfile(token, userInfo);
  const now = new Date();
  const user = await resolveWeChatUser(profile, now);
  const db = await getDb();

  if (!db) {
    throw new WeChatAuthError(
      503,
      "Database is not ready, so WeChat login cannot complete.",
      "db_unavailable"
    );
  }

  const nextName = shouldRefreshUserName(user.name, user.loginMethod)
    ? profile.nickname || user.name
    : user.name;
  const nextAvatarUrl = shouldRefreshUserAvatar(user.avatarUrl, user.loginMethod)
    ? profile.avatarUrl || user.avatarUrl
    : user.avatarUrl;

  await db
    .update(users)
    .set({
      name: nextName,
      avatarUrl: nextAvatarUrl,
      loginMethod: WECHAT_PROVIDER,
      lastSignedIn: now,
    })
    .where(eq(users.id, user.id));

  const identityId = await upsertWeChatIdentity(user.id, profile, now);
  const [freshUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!freshUser) {
    throw new WeChatAuthError(
      500,
      "The local account could not be reloaded after WeChat login.",
      "user_reload_failed"
    );
  }

  if (freshUser.status === "disabled") {
    await appendWeChatAuditLog({
      userId: freshUser.id,
      identityId,
      eventType: "auth.login.wechat",
      target: profile.openId,
      ipAddress: input.requestIp,
      userAgent: input.userAgent,
      success: false,
      errorCode: "user_disabled",
      errorMessage: "Disabled user attempted WeChat login",
    });
    throw new WeChatAuthError(
      403,
      "This account has been disabled.",
      "user_disabled"
    );
  }

  await appendWeChatAuditLog({
    userId: freshUser.id,
    identityId,
    eventType: "auth.login.wechat",
    target: profile.openId,
    ipAddress: input.requestIp,
    userAgent: input.userAgent,
    success: true,
  });

  return {
    user: freshUser,
    redirectTarget: statePayload.redirectTarget,
    profile,
  };
}
