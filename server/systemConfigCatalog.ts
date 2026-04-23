import {
  ENV,
  getBaseEnvValueBySystemKey,
  getEffectiveEnvValueBySystemKey,
  getSmsProviderMode,
  isSmsDeliveryReady,
  isTencentSmsConfigured,
  isWeChatLoginReady,
} from "./_core/env.js";

export type SystemSettingCategory = "site" | "storage" | "email" | "payments" | "alerts";
export type SystemSettingInputType = "text" | "textarea" | "number" | "select" | "secret" | "url";

export type SystemSettingDefinition = {
  key: string;
  label: string;
  description: string;
  category: SystemSettingCategory;
  inputType: SystemSettingInputType;
  options?: Array<{ label: string; value: string }>;
  secret?: boolean;
  placeholder?: string;
};

export const SYSTEM_SETTING_DEFINITIONS: SystemSettingDefinition[] = [
  {
    key: "PUBLIC_APP_URL",
    label: "公开站点地址",
    description: "站内回跳、支付结果页、媒体分发和通知里使用的绝对地址。",
    category: "site",
    inputType: "url",
    placeholder: "https://example.com",
  },
  {
    key: "PAYMENT_RETURN_URL_BASE",
    label: "支付结果页基准地址",
    description: "不填时会回退到公开站点地址。",
    category: "site",
    inputType: "url",
    placeholder: "https://example.com",
  },
  {
    key: "PAYMENT_DEFAULT_PROVIDER",
    label: "默认支付渠道",
    description: "前台优先展示的支付方式。",
    category: "site",
    inputType: "select",
    options: [
      { label: "支付宝", value: "alipay" },
      { label: "微信支付", value: "wechat" },
      { label: "模拟支付", value: "mock" },
    ],
  },
  {
    key: "STORAGE_DRIVER",
    label: "存储驱动",
    description: "决定媒体上传和下载默认走本地、Forge 还是 S3 兼容存储。",
    category: "storage",
    inputType: "select",
    options: [
      { label: "自动", value: "auto" },
      { label: "本地", value: "local" },
      { label: "Forge", value: "forge" },
      { label: "S3 / R2 / MinIO", value: "s3" },
    ],
  },
  {
    key: "S3_ENDPOINT",
    label: "S3 Endpoint",
    description: "Cloudflare R2 / MinIO 等 S3 兼容服务的 Endpoint。",
    category: "storage",
    inputType: "url",
  },
  {
    key: "S3_REGION",
    label: "S3 Region",
    description: "AWS S3 区域，或兼容存储要求的 region。",
    category: "storage",
    inputType: "text",
    placeholder: "auto / us-east-1",
  },
  {
    key: "S3_BUCKET",
    label: "S3 Bucket",
    description: "对象存储桶名称。",
    category: "storage",
    inputType: "text",
  },
  {
    key: "S3_ACCESS_KEY_ID",
    label: "S3 Access Key ID",
    description: "对象存储访问密钥 ID。",
    category: "storage",
    inputType: "text",
  },
  {
    key: "S3_SECRET_ACCESS_KEY",
    label: "S3 Secret Access Key",
    description: "对象存储访问密钥 Secret。",
    category: "storage",
    inputType: "secret",
    secret: true,
  },
  {
    key: "S3_PUBLIC_BASE_URL",
    label: "S3 公网基准地址",
    description: "生成可公开访问的对象地址时使用。",
    category: "storage",
    inputType: "url",
  },
  {
    key: "MEDIA_SIGNED_URL_TTL_SECONDS",
    label: "媒体签名地址 TTL（秒）",
    description: "对象存储签名下载链接的默认有效期。",
    category: "storage",
    inputType: "number",
  },
  {
    key: "EMAIL_DELIVERY_MODE",
    label: "邮件投递模式",
    description: "可切换日志、Webhook 或 Resend 真实发送。",
    category: "email",
    inputType: "select",
    options: [
      { label: "仅日志", value: "log" },
      { label: "Webhook", value: "webhook" },
      { label: "Resend", value: "resend" },
    ],
  },
  {
    key: "RESEND_API_KEY",
    label: "Resend API Key",
    description: "使用 Resend 真实发邮件时必填。",
    category: "email",
    inputType: "secret",
    secret: true,
  },
  {
    key: "RESEND_API_BASE_URL",
    label: "Resend API Base URL",
    description: "默认官方地址，通常无需改动。",
    category: "email",
    inputType: "url",
  },
  {
    key: "EMAIL_WEBHOOK_URL",
    label: "邮件 Webhook URL",
    description: "使用自建邮件服务时的接收地址。",
    category: "email",
    inputType: "url",
  },
  {
    key: "EMAIL_WEBHOOK_SECRET",
    label: "邮件 Webhook Secret",
    description: "用于签名邮件投递 Webhook。",
    category: "email",
    inputType: "secret",
    secret: true,
  },
  {
    key: "EMAIL_FROM_NAME",
    label: "发件人名称",
    description: "交易邮件显示的发送者名称。",
    category: "email",
    inputType: "text",
  },
  {
    key: "EMAIL_FROM_ADDRESS",
    label: "发件邮箱",
    description: "Resend 或自建邮件服务实际使用的发件地址。",
    category: "email",
    inputType: "text",
    placeholder: "noreply@example.com",
  },
  {
    key: "ADMIN_ALERT_INBOX_ENABLED",
    label: "审计告警站内信",
    description: "是否把高风险后台操作同步推送给 owner / manager 后台成员的站内消息。",
    category: "alerts",
    inputType: "select",
    options: [
      { label: "开启", value: "true" },
      { label: "关闭", value: "false" },
    ],
  },
  {
    key: "ADMIN_ALERT_EMAIL_ENABLED",
    label: "审计告警邮件",
    description: "是否把高风险后台操作同步发到 owner / manager 后台成员邮箱。",
    category: "alerts",
    inputType: "select",
    options: [
      { label: "开启", value: "true" },
      { label: "关闭", value: "false" },
    ],
  },
  {
    key: "ADMIN_ALERT_WEBHOOK_URL",
    label: "审计告警 Webhook",
    description: "高风险后台操作会推到这个 Webhook。",
    category: "alerts",
    inputType: "url",
  },
  {
    key: "ADMIN_ALERT_WEBHOOK_SECRET",
    label: "审计告警 Webhook Secret",
    description: "用于签名审计告警 Webhook。",
    category: "alerts",
    inputType: "secret",
    secret: true,
  },
  {
    key: "ADMIN_RISK_ESCALATE_AFTER_MINUTES",
    label: "风险首次升级分钟数",
    description: "高危风险事件在无人处理时，经过多少分钟自动升级。",
    category: "alerts",
    inputType: "number",
  },
  {
    key: "ADMIN_RISK_ESCALATE_REPEAT_MINUTES",
    label: "风险重复升级分钟数",
    description: "已升级但仍未处理的风险事件，继续升级的时间间隔。",
    category: "alerts",
    inputType: "number",
  },
  {
    key: "PAYMENT_CALLBACK_SECRET",
    label: "支付回调签名 Secret",
    description: "统一支付回调 HMAC 签名密钥。",
    category: "payments",
    inputType: "secret",
    secret: true,
  },
  {
    key: "PAYMENT_NOTIFICATION_WEBHOOK_URL",
    label: "支付通知 Webhook",
    description: "支付成功/退款等后台通知推送地址。",
    category: "payments",
    inputType: "url",
  },
  {
    key: "PAYMENT_NOTIFICATION_WEBHOOK_SECRET",
    label: "支付通知 Webhook Secret",
    description: "支付通知推送使用的签名密钥。",
    category: "payments",
    inputType: "secret",
    secret: true,
  },
  {
    key: "PAYMENT_NOTIFY_OWNER",
    label: "站长通知",
    description: "是否把支付事件同时推送给站长。",
    category: "payments",
    inputType: "select",
    options: [
      { label: "开启", value: "true" },
      { label: "关闭", value: "false" },
    ],
  },
  {
    key: "WECHAT_PAY_BASE_URL",
    label: "微信支付网关",
    description: "默认 API v3 地址，通常无需改动。",
    category: "payments",
    inputType: "url",
  },
  {
    key: "WECHAT_PAY_APP_ID",
    label: "微信支付 AppID",
    description: "微信 Native 支付所需的 AppID。",
    category: "payments",
    inputType: "text",
  },
  {
    key: "WECHAT_PAY_MCH_ID",
    label: "微信商户号",
    description: "微信支付商户号。",
    category: "payments",
    inputType: "text",
  },
  {
    key: "WECHAT_PAY_CERT_SERIAL_NO",
    label: "微信证书序列号",
    description: "微信 API v3 商户证书序列号。",
    category: "payments",
    inputType: "text",
  },
  {
    key: "WECHAT_PAY_PRIVATE_KEY",
    label: "微信商户私钥",
    description: "支持多行 PEM 内容。",
    category: "payments",
    inputType: "textarea",
    secret: true,
  },
  {
    key: "WECHAT_PAY_API_V3_KEY",
    label: "微信 APIv3 Key",
    description: "用于解密微信回调。",
    category: "payments",
    inputType: "secret",
    secret: true,
  },
  {
    key: "WECHAT_PAY_PLATFORM_PUBLIC_KEY",
    label: "微信平台公钥",
    description: "支持多行 PEM 内容。",
    category: "payments",
    inputType: "textarea",
  },
  {
    key: "WECHAT_PAY_NOTIFY_URL",
    label: "微信支付回调地址",
    description: "不填时会自动拼接公开站点地址。",
    category: "payments",
    inputType: "url",
  },
  {
    key: "ALIPAY_GATEWAY_URL",
    label: "支付宝网关",
    description: "默认支付宝开放平台网关地址。",
    category: "payments",
    inputType: "url",
  },
  {
    key: "ALIPAY_APP_ID",
    label: "支付宝 AppID",
    description: "支付宝应用 ID。",
    category: "payments",
    inputType: "text",
  },
  {
    key: "ALIPAY_PRIVATE_KEY",
    label: "支付宝应用私钥",
    description: "支持多行 PEM 内容。",
    category: "payments",
    inputType: "textarea",
    secret: true,
  },
  {
    key: "ALIPAY_PUBLIC_KEY",
    label: "支付宝公钥",
    description: "支持多行 PEM 内容。",
    category: "payments",
    inputType: "textarea",
  },
  {
    key: "ALIPAY_NOTIFY_URL",
    label: "支付宝回调地址",
    description: "不填时会自动拼接公开站点地址。",
    category: "payments",
    inputType: "url",
  },
  {
    key: "ALIPAY_RETURN_URL",
    label: "支付宝跳转地址",
    description: "支付完成后浏览器返回的前台地址。",
    category: "payments",
    inputType: "url",
  },
];

export const SYSTEM_SETTING_MAP = new Map(SYSTEM_SETTING_DEFINITIONS.map((item) => [item.key, item]));

export function maskSettingValue(value: string | null | undefined, secret?: boolean) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (!secret) return text;
  if (text.length <= 6) return "••••••";
  return `${text.slice(0, 2)}••••••${text.slice(-2)}`;
}

export function serializeSystemSettingOverview(key: string, overrideValue?: string | null) {
  const definition = SYSTEM_SETTING_MAP.get(key);
  if (!definition) return null;
  const baseValue = getBaseEnvValueBySystemKey(key);
  const effectiveValue = getEffectiveEnvValueBySystemKey(key);
  const hasOverride = overrideValue !== undefined && overrideValue !== null;
  const source = hasOverride ? "override" : baseValue ? "env" : "default";
  return {
    ...definition,
    envValue: definition.secret ? maskSettingValue(baseValue, true) : baseValue,
    envValueRaw: definition.secret ? null : baseValue,
    overrideValue: definition.secret ? maskSettingValue(overrideValue, true) : (overrideValue ?? ""),
    overrideValueRaw: definition.secret ? null : (overrideValue ?? ""),
    effectiveValue: definition.secret ? maskSettingValue(effectiveValue, true) : effectiveValue,
    effectiveValueRaw: definition.secret ? null : effectiveValue,
    hasOverride,
    source,
  };
}

export function buildSystemCategorySummary() {
  const driver = ENV.storageDriver || "auto";
  const storageReady =
    driver === "local" ||
    (driver === "forge" && Boolean(ENV.forgeApiUrl && ENV.forgeApiKey)) ||
    (driver === "s3" && Boolean(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey)) ||
    (driver === "auto" && (Boolean(ENV.forgeApiUrl && ENV.forgeApiKey) || Boolean(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey) || true));

  const emailMode = String(ENV.emailDeliveryMode || "log").toLowerCase();
  const emailReady =
    emailMode === "log"
      ? true
      : emailMode === "webhook"
        ? Boolean(ENV.emailWebhookUrl)
        : Boolean(ENV.resendApiKey && ENV.emailFromAddress);

  return {
    site: {
      publicAppUrl: ENV.publicAppUrl || "",
      paymentReturnUrlBase: ENV.paymentReturnUrlBase || ENV.publicAppUrl || "",
    },
    auth: {
      smsProvider: getSmsProviderMode(),
      smsReady: isSmsDeliveryReady(),
      tencentConfigured: isTencentSmsConfigured(),
      oauthReady: Boolean(ENV.appId && ENV.oAuthServerUrl),
      wechatLoginConfigured: isWeChatLoginReady(),
    },
    storage: {
      driver,
      ready: storageReady,
      directUploadReady: driver === "s3" && Boolean(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey),
      bucket: ENV.s3Bucket || "",
      endpoint: ENV.s3Endpoint || "",
    },
    email: {
      mode: emailMode,
      ready: emailReady,
      fromAddress: ENV.emailFromAddress || "",
      resendConfigured: Boolean(ENV.resendApiKey),
      webhookConfigured: Boolean(ENV.emailWebhookUrl),
    },
    alerts: {
      inboxEnabled: Boolean(ENV.adminAlertInboxEnabled),
      emailEnabled: Boolean(ENV.adminAlertEmailEnabled),
      webhookConfigured: Boolean(ENV.adminAlertWebhookUrl),
      ready: Boolean(ENV.adminAlertInboxEnabled || ENV.adminAlertEmailEnabled || ENV.adminAlertWebhookUrl),
    },
  };
}
