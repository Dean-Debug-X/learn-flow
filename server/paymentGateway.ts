import crypto from "node:crypto";
import { ENV } from "./_core/env.js";
import { createPaymentSession, getOrderById, setOrderPaymentMethod, updatePaymentSession } from "./db.js";

type GatewayProvider = "mock" | "wechat" | "alipay";
type GatewayChannel = "native" | "page" | "manual";

type GatewaySessionResult = {
  provider: GatewayProvider;
  channel: GatewayChannel;
  mode: "qr" | "redirect" | "instant";
  providerSessionId?: string | null;
  paymentUrl?: string | null;
  codeUrl?: string | null;
  displayContent?: string | null;
  expiresAt?: Date | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
};

function normalizePem(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("BEGIN")) return trimmed.replace(/\\n/g, "\n");
  return trimmed.replace(/\\n/g, "\n");
}

function formatBeijingTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildAppAbsoluteUrl(pathname: string) {
  const base = ENV.publicAppUrl || ENV.paymentReturnUrlBase || "";
  if (!base) return pathname;
  return new URL(pathname, base.endsWith("/") ? base : `${base}/`).toString();
}

function buildWeChatNotifyUrl() {
  return ENV.wechatPayNotifyUrl || buildAppAbsoluteUrl("/api/payments/wechat/notify");
}

function buildAlipayNotifyUrl() {
  return ENV.alipayNotifyUrl || buildAppAbsoluteUrl("/api/payments/alipay/notify");
}

function buildPaymentResultUrl(params: { orderNo: string; checkoutToken?: string | null; provider?: GatewayProvider | null }) {
  const base = ENV.paymentReturnUrlBase || ENV.publicAppUrl || ENV.alipayReturnUrl || "";
  if (!base) {
    const relative = new URL("/payment/pending", "http://localhost");
    relative.searchParams.set("orderNo", params.orderNo);
    if (params.checkoutToken) relative.searchParams.set("checkoutToken", params.checkoutToken);
    if (params.provider) relative.searchParams.set("provider", params.provider);
    return `${relative.pathname}${relative.search}`;
  }
  const url = new URL("/payment/pending", base.startsWith("http") ? base : `http://localhost${base.startsWith("/") ? "" : "/"}${base}`);
  url.searchParams.set("orderNo", params.orderNo);
  if (params.checkoutToken) url.searchParams.set("checkoutToken", params.checkoutToken);
  if (params.provider) url.searchParams.set("provider", params.provider);
  return base.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

function rsaSha256Sign(content: string, privateKey: string) {
  return crypto.sign("RSA-SHA256", Buffer.from(content), normalizePem(privateKey)).toString("base64");
}

function buildWechatAuthorization(method: string, pathnameWithQuery: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${method}\n${pathnameWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = rsaSha256Sign(message, ENV.wechatPayPrivateKey);
  return {
    timestamp,
    nonce,
    authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${ENV.wechatPayMchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${ENV.wechatPaySerialNo}",signature="${signature}"`,
  };
}

function stringifyPlain(value: unknown) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildAlipaySignContent(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => params[key] !== "" && params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function getGatewayStatus() {
  const wechatReady = Boolean(
    ENV.wechatPayAppId &&
      ENV.wechatPayMchId &&
      ENV.wechatPayPrivateKey &&
      ENV.wechatPaySerialNo
  );
  const alipayReady = Boolean(ENV.alipayAppId && ENV.alipayPrivateKey);
  const supported = [
    {
      provider: "alipay" as const,
      label: "支付宝",
      ready: alipayReady,
      channel: "page" as const,
      notifyUrl: buildAlipayNotifyUrl(),
      reason: alipayReady ? null : "缺少 APP_ID 或应用私钥",
    },
    {
      provider: "wechat" as const,
      label: "微信支付",
      ready: wechatReady,
      channel: "native" as const,
      notifyUrl: buildWeChatNotifyUrl(),
      reason: wechatReady ? null : "缺少 AppID / 商户号 / 证书序列号 / 商户私钥",
    },
    {
      provider: "mock" as const,
      label: "模拟支付",
      ready: true,
      channel: "manual" as const,
      notifyUrl: null,
      reason: null,
    },
  ];
  const desiredDefault = String(ENV.paymentDefaultProvider || "alipay").toLowerCase();
  const defaultProvider =
    (supported.find((item) => item.provider === desiredDefault && item.ready)?.provider as GatewayProvider | undefined) ||
    (supported.find((item) => item.ready && item.provider !== "mock")?.provider as GatewayProvider | undefined) ||
    "mock";

  return {
    defaultProvider,
    supported,
    paymentReturnUrlBase: ENV.paymentReturnUrlBase || ENV.publicAppUrl || "",
  };
}

async function createWechatNativeSession(order: Awaited<ReturnType<typeof getOrderById>>) {
  if (!order) throw new Error("订单不存在");
  const endpointBase = (ENV.wechatPayBaseUrl || "https://api.mch.weixin.qq.com").replace(/\/$/, "");
  const pathname = "/v3/pay/transactions/native";
  const bodyPayload = {
    appid: ENV.wechatPayAppId,
    mchid: ENV.wechatPayMchId,
    description: order.productSnapshotTitle,
    out_trade_no: order.orderNo,
    notify_url: buildWeChatNotifyUrl(),
    time_expire: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    attach: `order:${order.id}`,
    amount: {
      total: Number(order.amountCents),
      currency: "CNY",
    },
  };
  const body = JSON.stringify(bodyPayload);
  const signed = buildWechatAuthorization("POST", pathname, body);
  const response = await fetch(`${endpointBase}${pathname}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: signed.authorization,
      "Wechatpay-Serial": ENV.wechatPaySerialNo,
    },
    body,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`微信支付下单失败：${response.status} ${json?.message || json?.code || text || "Unknown error"}`);
  }
  if (!json?.code_url) {
    throw new Error("微信支付未返回 code_url");
  }
  return {
    provider: "wechat" as const,
    channel: "native" as const,
    mode: "qr" as const,
    providerSessionId: json?.prepay_id || json?.out_trade_no || null,
    codeUrl: String(json.code_url),
    displayContent: `请使用微信扫一扫完成支付。订单号：${order.orderNo}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    requestPayload: { endpoint: `${endpointBase}${pathname}`, headers: { ...signed, authorization: "[redacted]" }, body: bodyPayload },
    responsePayload: json,
  };
}

async function createAlipayPageSession(order: Awaited<ReturnType<typeof getOrderById>>, checkoutToken: string) {
  if (!order) throw new Error("订单不存在");
  const gatewayUrl = ENV.alipayGatewayUrl || "https://openapi.alipay.com/gateway.do";
  const params: Record<string, string> = {
    app_id: ENV.alipayAppId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: formatBeijingTimestamp(),
    version: "1.0",
    notify_url: buildAlipayNotifyUrl(),
    biz_content: JSON.stringify({
      out_trade_no: order.orderNo,
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: (Number(order.amountCents) / 100).toFixed(2),
      subject: order.productSnapshotTitle,
      body: order.course?.title || order.product?.title || order.productSnapshotTitle,
    }),
  };
  const returnUrl = buildPaymentResultUrl({ orderNo: order.orderNo, checkoutToken, provider: "alipay" });
  if (returnUrl) params.return_url = returnUrl;
  const signContent = buildAlipaySignContent(params);
  params.sign = rsaSha256Sign(signContent, ENV.alipayPrivateKey);
  const paymentUrl = `${gatewayUrl}?${new URLSearchParams(params).toString()}`;
  return {
    provider: "alipay" as const,
    channel: "page" as const,
    mode: "redirect" as const,
    paymentUrl,
    displayContent: "将跳转到支付宝收银台完成支付。",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    requestPayload: { gatewayUrl, params: { ...params, sign: "[redacted]" }, signContent },
    responsePayload: { paymentUrl },
  };
}

export async function createCheckoutForOrder(input: {
  orderId: number;
  userId: number;
  provider: GatewayProvider;
  channel?: GatewayChannel;
}) {
  const order = await getOrderById(input.orderId);
  if (!order || order.userId !== input.userId) {
    throw new Error("订单不存在");
  }
  if (order.status !== "pending") {
    throw new Error("只有待支付订单才能发起支付");
  }

  const status = getGatewayStatus();
  const providerStatus = status.supported.find((item) => item.provider === input.provider);
  if (!providerStatus?.ready && input.provider !== "mock") {
    throw new Error(`${providerStatus?.label || input.provider} 尚未配置完成：${providerStatus?.reason || "缺少必要参数"}`);
  }

  if (input.provider === "mock") {
    await setOrderPaymentMethod(order.id, "mock");
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      provider: "mock" as const,
      channel: "manual" as const,
      mode: "instant" as const,
      launchUrl: null,
      statusPageUrl: buildPaymentResultUrl({ orderNo: order.orderNo, provider: "mock" }),
      message: "请继续使用模拟支付接口完成支付。",
      session: null,
    };
  }

  const checkoutToken = crypto.randomUUID().replace(/-/g, "");
  const session = await createPaymentSession(order.id, {
    provider: input.provider,
    channel: input.channel ?? (input.provider === "wechat" ? "native" : "page"),
    status: "created",
    checkoutToken,
    requestPayload: { orderId: order.id, provider: input.provider },
  });

  try {
    const result: GatewaySessionResult = input.provider === "wechat"
      ? await createWechatNativeSession(order)
      : await createAlipayPageSession(order, checkoutToken);

    await setOrderPaymentMethod(order.id, input.provider);
    await updatePaymentSession(session!.id, {
      providerSessionId: result.providerSessionId ?? null,
      status: result.mode === "redirect" || result.mode === "qr" ? "pending_callback" : "awaiting_action",
      redirectUrl: result.paymentUrl ?? null,
      codeUrl: result.codeUrl ?? null,
      displayContent: result.displayContent ?? null,
      expiresAt: result.expiresAt ?? null,
      requestPayload: result.requestPayload,
      responsePayload: result.responsePayload,
    });

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      provider: result.provider,
      channel: result.channel,
      mode: result.mode,
      launchUrl: `/api/payments/session/${checkoutToken}/view`,
      statusPageUrl: buildPaymentResultUrl({ orderNo: order.orderNo, checkoutToken, provider: result.provider }),
      expiresAt: result.expiresAt ?? null,
      message: result.displayContent ?? null,
      session: await updatePaymentSession(session!.id, {}),
    };
  } catch (error) {
    await updatePaymentSession(session!.id, {
      status: "failed",
      responsePayload: { error: error instanceof Error ? error.message : "Checkout creation failed" },
    });
    throw error;
  }
}

export function getPaymentGatewayOverview() {
  return getGatewayStatus();
}
