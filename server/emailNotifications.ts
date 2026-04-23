import crypto from "node:crypto";
import { ENV } from "./_core/env.js";

export type EmailDeliveryChannel = "log" | "webhook" | "resend";

export async function dispatchEmailDelivery(input: {
  to: string | null | undefined;
  subject: string;
  text: string;
  html?: string | null;
  payload?: unknown;
  eventType: string;
}) {
  const recipient = input.to?.trim() || "";
  if (!recipient) {
    return { ok: true, skipped: true, message: "收件人邮箱为空，已跳过邮件投递", provider: resolveEmailProvider() } as const;
  }

  const provider = resolveEmailProvider();
  if (provider === "log") {
    console.info("[EmailDelivery][log]", {
      to: recipient,
      subject: input.subject,
      eventType: input.eventType,
      from: formatFromAddress(),
      preview: input.text.slice(0, 160),
    });
    return { ok: true, skipped: true, message: "邮件日志已记录，未实际发送", provider } as const;
  }

  if (provider === "resend") {
    return sendViaResend({
      to: recipient,
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined,
      eventType: input.eventType,
      payload: input.payload ?? null,
    });
  }

  const webhookUrl = ENV.emailWebhookUrl;
  if (!webhookUrl) {
    return { ok: true, skipped: true, message: "未配置邮件 Webhook，已跳过发送", provider } as const;
  }

  const payload = {
    to: recipient,
    from: formatFromAddress(),
    fromName: ENV.emailFromName || "LearnFlow",
    subject: input.subject,
    text: input.text,
    html: input.html ?? undefined,
    eventType: input.eventType,
    payload: input.payload ?? null,
  };
  const rawBody = JSON.stringify(payload);
  const secret = ENV.emailWebhookSecret || ENV.paymentCallbackSecret || ENV.cookieSecret;
  const signature = crypto.createHmac("sha256", secret || "learnflow-email").update(rawBody).digest("hex");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-email-signature": signature,
        "x-email-event": input.eventType,
      },
      body: rawBody,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        skipped: false,
        message: `邮件 Webhook 返回 ${response.status}${detail ? `: ${detail}` : ""}`,
        provider,
      } as const;
    }
    return { ok: true, skipped: false, message: "邮件 Webhook 已接受请求", provider } as const;
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: error instanceof Error ? error.message : "邮件发送失败",
      provider,
    } as const;
  }
}

async function sendViaResend(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  eventType: string;
  payload?: unknown;
}) {
  const apiKey = (ENV.resendApiKey || "").trim();
  if (!apiKey) {
    return { ok: true, skipped: true, message: "未配置 Resend API Key，已跳过发送", provider: "resend" } as const;
  }
  const endpointBase = (ENV.resendApiBaseUrl || "https://api.resend.com").replace(/\/$/, "");
  const body = {
    from: formatFromAddress(),
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html,
    tags: [
      { name: "event", value: input.eventType },
      { name: "app", value: "learnflow" },
    ],
  };
  try {
    const response = await fetch(`${endpointBase}/emails`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        skipped: false,
        message: `Resend 返回 ${response.status}${detail ? `: ${detail}` : ""}`,
        provider: "resend",
      } as const;
    }
    const result = await response.json().catch(() => null);
    return {
      ok: true,
      skipped: false,
      message: `Resend 已接受邮件请求${result?.id ? `（${result.id}）` : ""}`,
      provider: "resend",
    } as const;
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: error instanceof Error ? error.message : "Resend 发送失败",
      provider: "resend",
    } as const;
  }
}

export function resolveEmailProvider(): EmailDeliveryChannel {
  const mode = String(ENV.emailDeliveryMode || "log").toLowerCase();
  if (mode === "resend") return "resend";
  if (mode === "webhook") return "webhook";
  return "log";
}

function formatFromAddress() {
  const name = (ENV.emailFromName || "LearnFlow").trim();
  const address = (ENV.emailFromAddress || "").trim();
  if (!address) return name;
  return `${name} <${address}>`;
}
