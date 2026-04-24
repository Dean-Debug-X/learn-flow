import { ENV } from "./_core/env.js";

type GatewayProvider = "mock" | "wechat" | "alipay";
type GatewayChannel = "native" | "page" | "manual";

const PAYMENTS_DISABLED_REASON = "当前站点未开放在线支付";

export function paymentsEnabled() {
  return String(ENV.paymentDefaultProvider || "").trim().toLowerCase() !== "disabled";
}

function getPaymentGatewayStatus() {
  const enabled = paymentsEnabled();

  return {
    enabled,
    defaultProvider: enabled ? (ENV.paymentDefaultProvider as GatewayProvider) : null,
    supported: [
      {
        provider: "alipay" as const,
        label: "支付宝",
        ready: false,
        channel: "page" as const,
        notifyUrl: null,
        reason: PAYMENTS_DISABLED_REASON,
      },
      {
        provider: "wechat" as const,
        label: "微信支付",
        ready: false,
        channel: "native" as const,
        notifyUrl: null,
        reason: PAYMENTS_DISABLED_REASON,
      },
      {
        provider: "mock" as const,
        label: "模拟支付",
        ready: false,
        channel: "manual" as const,
        notifyUrl: null,
        reason: PAYMENTS_DISABLED_REASON,
      },
    ],
    paymentReturnUrlBase: ENV.paymentReturnUrlBase || ENV.publicAppUrl || "",
  };
}

export async function createCheckoutForOrder(_input: {
  orderId: number;
  userId: number;
  provider: GatewayProvider;
  channel?: GatewayChannel;
}) {
  throw new Error(PAYMENTS_DISABLED_REASON);
}

export function getPaymentGatewayOverview() {
  return getPaymentGatewayStatus();
}
