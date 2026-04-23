import crypto from "node:crypto";
import { ENV } from "./_core/env.js";

export type AdminAlertChannel = "log" | "inbox" | "email" | "webhook";

export async function dispatchAdminAlertDelivery(input: {
  channel: AdminAlertChannel;
  eventKey: string;
  severity: "warn" | "critical";
  title: string;
  content: string;
  recipient?: string | null;
  payload?: unknown;
}) {
  if (input.channel === "log") {
    console.warn("[AdminAlert][log]", {
      eventKey: input.eventKey,
      severity: input.severity,
      title: input.title,
      recipient: input.recipient ?? null,
      preview: input.content.slice(0, 180),
    });
    return { ok: true, skipped: true, message: "审计告警已写入服务端日志" } as const;
  }

  if (input.channel === "webhook") {
    const webhookUrl = (ENV.adminAlertWebhookUrl || "").trim();
    if (!webhookUrl) {
      return { ok: true, skipped: true, message: "未配置审计告警 Webhook，已跳过推送" } as const;
    }
    const body = JSON.stringify({
      eventKey: input.eventKey,
      severity: input.severity,
      title: input.title,
      content: input.content,
      recipient: input.recipient ?? null,
      payload: input.payload ?? null,
    });
    const secret = ENV.adminAlertWebhookSecret || ENV.paymentCallbackSecret || ENV.cookieSecret || "learnflow-admin-alert";
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-alert-signature": signature,
          "x-admin-alert-severity": input.severity,
          "x-admin-alert-event": input.eventKey,
        },
        body,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return { ok: false, skipped: false, message: `审计告警 Webhook 返回 ${response.status}${detail ? `: ${detail}` : ""}` } as const;
      }
      return { ok: true, skipped: false, message: "审计告警 Webhook 已接受请求" } as const;
    } catch (error) {
      return { ok: false, skipped: false, message: error instanceof Error ? error.message : "审计告警 Webhook 发送失败" } as const;
    }
  }

  return { ok: true, skipped: true, message: `${input.channel} 渠道由数据库侧落库处理` } as const;
}
