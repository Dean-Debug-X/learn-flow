const BASE_ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  storageDriver: process.env.STORAGE_DRIVER ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",
  signedUrlTtlSeconds: Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? 300),
  mediaTicketSecret: process.env.MEDIA_TICKET_SECRET ?? process.env.JWT_SECRET ?? "",
  mediaTicketTtlSeconds: Number(process.env.MEDIA_TICKET_TTL_SECONDS ?? 180),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  transcodeProvider: process.env.TRANSCODE_PROVIDER ?? "manual",
  transcodeWebhookUrl: process.env.TRANSCODE_WEBHOOK_URL ?? "",
  transcodeCallbackSecret: process.env.TRANSCODE_CALLBACK_SECRET ?? process.env.JWT_SECRET ?? "",
  transcodeSourceTtlSeconds: Number(process.env.TRANSCODE_SOURCE_TTL_SECONDS ?? 3600),
  paymentCallbackSecret: process.env.PAYMENT_CALLBACK_SECRET ?? process.env.JWT_SECRET ?? "",
  paymentNotificationWebhookUrl: process.env.PAYMENT_NOTIFICATION_WEBHOOK_URL ?? "",
  paymentNotificationWebhookSecret: process.env.PAYMENT_NOTIFICATION_WEBHOOK_SECRET ?? process.env.PAYMENT_CALLBACK_SECRET ?? process.env.JWT_SECRET ?? "",
  paymentNotifyOwner: String(process.env.PAYMENT_NOTIFY_OWNER ?? "true") !== "false",
  emailDeliveryMode: process.env.EMAIL_DELIVERY_MODE ?? "log",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendApiBaseUrl: process.env.RESEND_API_BASE_URL ?? "https://api.resend.com",
  emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL ?? "",
  emailWebhookSecret: process.env.EMAIL_WEBHOOK_SECRET ?? process.env.PAYMENT_CALLBACK_SECRET ?? process.env.JWT_SECRET ?? "",
  emailFromName: process.env.EMAIL_FROM_NAME ?? "LearnFlow",
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "",
  adminAlertInboxEnabled: String(process.env.ADMIN_ALERT_INBOX_ENABLED ?? "true") !== "false",
  adminAlertEmailEnabled: String(process.env.ADMIN_ALERT_EMAIL_ENABLED ?? "true") !== "false",
  adminAlertWebhookUrl: process.env.ADMIN_ALERT_WEBHOOK_URL ?? "",
  adminAlertWebhookSecret: process.env.ADMIN_ALERT_WEBHOOK_SECRET ?? process.env.PAYMENT_CALLBACK_SECRET ?? process.env.JWT_SECRET ?? "",
  adminRiskEscalateAfterMinutes: Number(process.env.ADMIN_RISK_ESCALATE_AFTER_MINUTES ?? 10),
  adminRiskRepeatEscalateMinutes: Number(process.env.ADMIN_RISK_ESCALATE_REPEAT_MINUTES ?? 30),
  paymentReturnUrlBase: process.env.PAYMENT_RETURN_URL_BASE ?? process.env.PUBLIC_APP_URL ?? "",
  paymentDefaultProvider: process.env.PAYMENT_DEFAULT_PROVIDER ?? "disabled",
  wechatLoginAppId: process.env.WECHAT_LOGIN_APP_ID ?? "",
  wechatLoginAppSecret: process.env.WECHAT_LOGIN_APP_SECRET ?? "",
  wechatLoginRedirectUri:
    process.env.WECHAT_LOGIN_REDIRECT_URI ??
    (process.env.PUBLIC_APP_URL
      ? `${process.env.PUBLIC_APP_URL}/api/auth/wechat/callback`
      : ""),
  smsProvider: process.env.SMS_PROVIDER ?? "",
  tencentSmsSecretId: process.env.TENCENT_SMS_SECRET_ID ?? "",
  tencentSmsSecretKey: process.env.TENCENT_SMS_SECRET_KEY ?? "",
  tencentSmsRegion: process.env.TENCENT_SMS_REGION ?? "ap-guangzhou",
  tencentSmsSdkAppId: process.env.TENCENT_SMS_SDK_APP_ID ?? "",
  tencentSmsSignName: process.env.TENCENT_SMS_SIGN_NAME ?? "",
  tencentSmsTemplateIdLogin:
    process.env.TENCENT_SMS_TEMPLATE_ID_LOGIN ?? "",
  wechatPayBaseUrl: process.env.WECHAT_PAY_BASE_URL ?? "https://api.mch.weixin.qq.com",
  wechatPayAppId: process.env.WECHAT_PAY_APP_ID ?? "",
  wechatPayMchId: process.env.WECHAT_PAY_MCH_ID ?? "",
  wechatPaySerialNo: process.env.WECHAT_PAY_CERT_SERIAL_NO ?? "",
  wechatPayPrivateKey: process.env.WECHAT_PAY_PRIVATE_KEY ?? "",
  wechatPayApiV3Key: process.env.WECHAT_PAY_API_V3_KEY ?? "",
  wechatPayPlatformPublicKey: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY ?? "",
  wechatPayNotifyUrl: process.env.WECHAT_PAY_NOTIFY_URL ?? "",
  alipayGatewayUrl: process.env.ALIPAY_GATEWAY_URL ?? "https://openapi.alipay.com/gateway.do",
  alipayAppId: process.env.ALIPAY_APP_ID ?? "",
  alipayPrivateKey: process.env.ALIPAY_PRIVATE_KEY ?? "",
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY ?? "",
  alipayNotifyUrl: process.env.ALIPAY_NOTIFY_URL ?? "",
  alipayReturnUrl: process.env.ALIPAY_RETURN_URL ?? process.env.PAYMENT_RETURN_URL_BASE ?? process.env.PUBLIC_APP_URL ?? "",
};

export const ENV = { ...BASE_ENV };

export type SmsProviderMode = "log" | "tencent" | "disabled";

export function getSmsProviderMode(env: typeof ENV = ENV): SmsProviderMode {
  const mode = String(env.smsProvider || "").trim().toLowerCase();
  if (mode === "log") return "log";
  if (mode === "tencent") return "tencent";
  return "disabled";
}

export function isTencentSmsConfigured(env: typeof ENV = ENV) {
  return Boolean(
    env.tencentSmsSecretId &&
      env.tencentSmsSecretKey &&
      env.tencentSmsRegion &&
      env.tencentSmsSdkAppId &&
      env.tencentSmsSignName &&
      env.tencentSmsTemplateIdLogin
  );
}

export function isSmsDeliveryReady(env: typeof ENV = ENV) {
  const mode = getSmsProviderMode(env);
  if (mode === "log") return true;
  if (mode === "tencent") return isTencentSmsConfigured(env);
  return false;
}

export function isWeChatLoginReady(env: typeof ENV = ENV) {
  return Boolean(
    env.wechatLoginAppId &&
      env.wechatLoginAppSecret &&
      (env.wechatLoginRedirectUri || env.publicAppUrl)
  );
}

const SYSTEM_KEY_TO_ENV_PROP = {
  PUBLIC_APP_URL: "publicAppUrl",
  PAYMENT_RETURN_URL_BASE: "paymentReturnUrlBase",
  PAYMENT_DEFAULT_PROVIDER: "paymentDefaultProvider",
  STORAGE_DRIVER: "storageDriver",
  S3_ENDPOINT: "s3Endpoint",
  S3_REGION: "s3Region",
  S3_BUCKET: "s3Bucket",
  S3_ACCESS_KEY_ID: "s3AccessKeyId",
  S3_SECRET_ACCESS_KEY: "s3SecretAccessKey",
  S3_PUBLIC_BASE_URL: "s3PublicBaseUrl",
  MEDIA_SIGNED_URL_TTL_SECONDS: "signedUrlTtlSeconds",
  EMAIL_DELIVERY_MODE: "emailDeliveryMode",
  RESEND_API_KEY: "resendApiKey",
  RESEND_API_BASE_URL: "resendApiBaseUrl",
  EMAIL_WEBHOOK_URL: "emailWebhookUrl",
  EMAIL_WEBHOOK_SECRET: "emailWebhookSecret",
  EMAIL_FROM_NAME: "emailFromName",
  EMAIL_FROM_ADDRESS: "emailFromAddress",
  ADMIN_ALERT_INBOX_ENABLED: "adminAlertInboxEnabled",
  ADMIN_ALERT_EMAIL_ENABLED: "adminAlertEmailEnabled",
  ADMIN_ALERT_WEBHOOK_URL: "adminAlertWebhookUrl",
  ADMIN_ALERT_WEBHOOK_SECRET: "adminAlertWebhookSecret",
  ADMIN_RISK_ESCALATE_AFTER_MINUTES: "adminRiskEscalateAfterMinutes",
  ADMIN_RISK_ESCALATE_REPEAT_MINUTES: "adminRiskRepeatEscalateMinutes",
  PAYMENT_CALLBACK_SECRET: "paymentCallbackSecret",
  PAYMENT_NOTIFICATION_WEBHOOK_URL: "paymentNotificationWebhookUrl",
  PAYMENT_NOTIFICATION_WEBHOOK_SECRET: "paymentNotificationWebhookSecret",
  PAYMENT_NOTIFY_OWNER: "paymentNotifyOwner",
  WECHAT_PAY_BASE_URL: "wechatPayBaseUrl",
  WECHAT_PAY_APP_ID: "wechatPayAppId",
  WECHAT_PAY_MCH_ID: "wechatPayMchId",
  WECHAT_PAY_CERT_SERIAL_NO: "wechatPaySerialNo",
  WECHAT_PAY_PRIVATE_KEY: "wechatPayPrivateKey",
  WECHAT_PAY_API_V3_KEY: "wechatPayApiV3Key",
  WECHAT_PAY_PLATFORM_PUBLIC_KEY: "wechatPayPlatformPublicKey",
  WECHAT_PAY_NOTIFY_URL: "wechatPayNotifyUrl",
  ALIPAY_GATEWAY_URL: "alipayGatewayUrl",
  ALIPAY_APP_ID: "alipayAppId",
  ALIPAY_PRIVATE_KEY: "alipayPrivateKey",
  ALIPAY_PUBLIC_KEY: "alipayPublicKey",
  ALIPAY_NOTIFY_URL: "alipayNotifyUrl",
  ALIPAY_RETURN_URL: "alipayReturnUrl",
} as const;

const NUMERIC_SYSTEM_KEYS = new Set(["MEDIA_SIGNED_URL_TTL_SECONDS", "ADMIN_RISK_ESCALATE_AFTER_MINUTES", "ADMIN_RISK_ESCALATE_REPEAT_MINUTES"]);
const BOOLEAN_SYSTEM_KEYS = new Set(["PAYMENT_NOTIFY_OWNER", "ADMIN_ALERT_INBOX_ENABLED", "ADMIN_ALERT_EMAIL_ENABLED"]);

export function refreshEnvFromSystemOverrides(overrides: Record<string, string | null | undefined> = {}) {
  Object.assign(ENV, BASE_ENV);
  for (const [systemKey, rawValue] of Object.entries(overrides)) {
    const prop = SYSTEM_KEY_TO_ENV_PROP[systemKey as keyof typeof SYSTEM_KEY_TO_ENV_PROP];
    if (!prop) continue;
    if (rawValue === undefined || rawValue === null) continue;
    const value = String(rawValue);
    if (NUMERIC_SYSTEM_KEYS.has(systemKey)) {
      (ENV as any)[prop] = Number(value || 0);
      continue;
    }
    if (BOOLEAN_SYSTEM_KEYS.has(systemKey)) {
      (ENV as any)[prop] = value !== "false";
      continue;
    }
    (ENV as any)[prop] = value;
  }
}

export function getBaseEnvValueBySystemKey(systemKey: string) {
  const prop = SYSTEM_KEY_TO_ENV_PROP[systemKey as keyof typeof SYSTEM_KEY_TO_ENV_PROP];
  if (!prop) return "";
  const value = (BASE_ENV as any)[prop];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export function getEffectiveEnvValueBySystemKey(systemKey: string) {
  const prop = SYSTEM_KEY_TO_ENV_PROP[systemKey as keyof typeof SYSTEM_KEY_TO_ENV_PROP];
  if (!prop) return "";
  const value = (ENV as any)[prop];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}
