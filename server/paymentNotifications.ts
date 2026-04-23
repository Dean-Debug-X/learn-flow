import crypto from "node:crypto";
import { ENV } from "./_core/env.js";
import { notifyOwner } from "./_core/notification.js";

export type PaymentNotificationChannel = "log" | "owner" | "webhook";

export async function dispatchPaymentNotificationDelivery(input: {
  channel: PaymentNotificationChannel;
  eventType: string;
  title: string;
  content: string;
  payload: unknown;
}) {
  if (input.channel === "log") {
    return { ok: true, skipped: false, message: "已写入通知中心日志" };
  }

  if (input.channel === "owner") {
    if (!ENV.paymentNotifyOwner) {
      return { ok: true, skipped: true, message: "未启用站长通知" };
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      return { ok: true, skipped: true, message: "未配置站长通知服务" };
    }
    try {
      const ok = await notifyOwner({ title: input.title, content: input.content });
      return ok
        ? { ok: true, skipped: false, message: "已发送站长通知" }
        : { ok: false, skipped: false, message: "站长通知发送失败" };
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        message: error instanceof Error ? error.message : "站长通知发送异常",
      };
    }
  }

  const webhookUrl = ENV.paymentNotificationWebhookUrl;
  if (!webhookUrl) {
    return { ok: true, skipped: true, message: "未配置支付通知 Webhook" };
  }

  const body = JSON.stringify({
    eventType: input.eventType,
    title: input.title,
    content: input.content,
    payload: input.payload,
  });
  const secret = ENV.paymentNotificationWebhookSecret || ENV.paymentCallbackSecret || ENV.cookieSecret;
  const signature = secret
    ? crypto.createHmac("sha256", secret).update(body).digest("hex")
    : "";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-notification-signature": signature,
        "x-payment-notification-event": input.eventType,
      },
      body,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        skipped: false,
        message: `Webhook 返回 ${response.status}${detail ? `: ${detail}` : ""}`,
      };
    }
    return { ok: true, skipped: false, message: "Webhook 通知已发送" };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: error instanceof Error ? error.message : "Webhook 通知发送失败",
    };
  }
}
