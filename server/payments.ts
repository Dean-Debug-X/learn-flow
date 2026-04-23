import crypto from "node:crypto";
import type { Request, Response } from "express";
import QRCode from "qrcode";
import { getPaymentSessionByToken, processPaymentCallback } from "./db.js";
import { ENV } from "./_core/env.js";

type PaymentProvider = "wechat" | "alipay" | "custom" | "manual";
type PaymentStatus = "paid" | "failed" | "cancelled" | "refunded";

type WechatNotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
  original_type?: string;
};

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortValue(value));
}

function normalizeProvider(value: unknown): PaymentProvider {
  const raw = String(value ?? "custom").toLowerCase();
  if (raw === "wechat" || raw === "alipay" || raw === "manual") return raw;
  return "custom";
}

function normalizeStatus(value: unknown): PaymentStatus | null {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "paid" || raw === "failed" || raw === "cancelled" || raw === "refunded") return raw;
  if (raw === "success") return "paid";
  if (raw === "fail") return "failed";
  return null;
}

function normalizePem(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.includes("BEGIN") ? trimmed.replace(/\\n/g, "\n") : trimmed.replace(/\\n/g, "\n");
}

function signPayload(payload: unknown) {
  const secret = ENV.paymentCallbackSecret || ENV.cookieSecret;
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(stableStringify(payload)).digest("hex");
}

function verifyHmacSignature(payload: unknown, signature: string) {
  const secret = ENV.paymentCallbackSecret || ENV.cookieSecret;
  if (!secret) return true;
  if (!signature) return false;
  const expected = signPayload(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function parsePaidAt(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmountToCents(value: unknown) {
  const raw = Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * 100);
}

function verifyAlipaySignature(payload: Record<string, unknown>) {
  const publicKey = normalizePem(ENV.alipayPublicKey);
  if (!publicKey) return false;
  const sign = String(payload.sign ?? "");
  if (!sign) return false;
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "sign" || key === "sign_type" || value == null || value === "") continue;
    data[key] = String(value);
  }
  const signContent = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("&");
  try {
    return crypto.verify("RSA-SHA256", Buffer.from(signContent, "utf8"), publicKey, Buffer.from(sign, "base64"));
  } catch {
    return false;
  }
}

function verifyWechatSignature(rawBody: string, req: Request) {
  const publicKey = normalizePem(ENV.wechatPayPlatformPublicKey);
  if (!publicKey) return false;
  const timestamp = String(req.header("wechatpay-timestamp") || "");
  const nonce = String(req.header("wechatpay-nonce") || "");
  const signature = String(req.header("wechatpay-signature") || "");
  if (!timestamp || !nonce || !signature) return false;
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  try {
    return crypto.verify("RSA-SHA256", Buffer.from(message, "utf8"), publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function decryptWechatResource(resource: WechatNotifyResource) {
  const apiV3Key = Buffer.from(String(ENV.wechatPayApiV3Key || ""), "utf8");
  if (apiV3Key.length !== 32) {
    throw new Error("WECHAT_PAY_API_V3_KEY 必须是 32 字节");
  }
  const nonce = Buffer.from(resource.nonce, "utf8");
  const cipherBuffer = Buffer.from(resource.ciphertext, "base64");
  const authTag = cipherBuffer.subarray(cipherBuffer.length - 16);
  const encrypted = cipherBuffer.subarray(0, cipherBuffer.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", apiV3Key, nonce);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted);
}

function mapWechatTradeState(value: unknown): PaymentStatus {
  const state = String(value ?? "").toUpperCase();
  if (state === "SUCCESS") return "paid";
  if (state === "CLOSED") return "cancelled";
  if (state === "REFUND") return "refunded";
  return "failed";
}

function mapAlipayTradeState(value: unknown): PaymentStatus | null {
  const state = String(value ?? "").toUpperCase();
  if (state === "TRADE_SUCCESS" || state === "TRADE_FINISHED") return "paid";
  if (state === "TRADE_CLOSED") return "cancelled";
  if (!state || state === "WAIT_BUYER_PAY") return null;
  return "failed";
}

function renderHtml(title: string, body: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}.card{max-width:720px;width:100%;background:#111827;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:24px;box-shadow:0 20px 80px rgba(0,0,0,.35)}a{color:#93c5fd}code,pre{background:#0b1220;border-radius:12px;padding:12px;display:block;overflow:auto;color:#bfdbfe}img{max-width:280px;border-radius:18px;background:white;padding:12px}</style></head><body><div class="card">${body}</div></body></html>`;
}

function buildPaymentResultUrl(params: { orderNo?: string | null; checkoutToken?: string | null; provider?: string | null }) {
  const base = ENV.paymentReturnUrlBase || ENV.publicAppUrl || ENV.alipayReturnUrl || "";
  const rawBase = base && base.startsWith("http") ? base : `http://localhost${base && base.startsWith("/") ? "" : "/"}${base || ""}`;
  const url = new URL("/payment/pending", rawBase || "http://localhost");
  if (params.orderNo) url.searchParams.set("orderNo", params.orderNo);
  if (params.checkoutToken) url.searchParams.set("checkoutToken", params.checkoutToken);
  if (params.provider) url.searchParams.set("provider", params.provider);
  return base && base.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

export async function handlePaymentSessionViewRequest(req: Request, res: Response) {
  const token = String(req.params.token || "").trim();
  if (!token) {
    res.status(400).send(renderHtml("支付会话无效", `<h1>支付会话无效</h1><p>缺少支付会话 token。</p>`));
    return;
  }
  const session = await getPaymentSessionByToken(token);
  if (!session) {
    res.status(404).send(renderHtml("支付会话不存在", `<h1>支付会话不存在</h1><p>这个支付会话可能已失效。</p>`));
    return;
  }
  const resultPageUrl = buildPaymentResultUrl({ orderNo: session.order?.orderNo ?? null, checkoutToken: session.checkoutToken, provider: session.provider });
  if (session.order?.status === "paid") {
    res.status(200).send(renderHtml("订单已支付", `<h1>订单已支付</h1><p>订单 <strong>${session.order.orderNo}</strong> 已经完成支付，可以返回站点继续学习。</p><p><a href="${resultPageUrl}">返回站内到账结果页</a></p>`));
    return;
  }
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    res.status(410).send(renderHtml("支付会话已过期", `<h1>支付会话已过期</h1><p>订单 <strong>${session.order?.orderNo ?? ""}</strong> 的这次支付会话已经过期，请返回站点重新发起支付。</p><p><a href="${resultPageUrl}">回到站内查看订单状态</a></p>`));
    return;
  }
  if (session.provider === "alipay" && session.redirectUrl) {
    res.redirect(session.redirectUrl);
    return;
  }
  if (session.provider === "wechat" && session.codeUrl) {
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(session.codeUrl, { width: 300, margin: 1 });
    } catch {
      qrDataUrl = "";
    }
    res.status(200).send(
      renderHtml(
        "微信扫码支付",
        `<h1 style="margin-top:0">微信扫码支付</h1>
         <p>${session.displayContent || "请使用微信扫一扫完成支付。"}</p>
         <p>订单号：<strong>${session.order?.orderNo ?? ""}</strong></p>
         ${qrDataUrl ? `<p><img src="${qrDataUrl}" alt="微信支付二维码" /></p>` : ""}
         <p>如果二维码显示异常，可以复制下面的 code_url 交给你的扫码工具：</p>
         <pre>${session.codeUrl}</pre>
         <p>支付完成后，微信支付会异步通知你的服务端回调地址，站点会自动完成发货和权益发放。</p>
         <p><a href="${resultPageUrl}">我已支付，返回站内到账结果页</a></p>`
      )
    );
    return;
  }
  res.status(200).send(
    renderHtml(
      "支付会话",
      `<h1 style="margin-top:0">支付会话已创建</h1><p>${session.displayContent || "会话已创建，但当前没有可直接跳转的支付地址。"}</p><pre>${JSON.stringify({
        provider: session.provider,
        channel: session.channel,
        status: session.status,
        redirectUrl: session.redirectUrl,
        codeUrl: session.codeUrl,
      }, null, 2)}</pre>`
    )
  );
}

export async function handlePaymentCallbackRequest(req: Request, res: Response) {
  try {
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const payloadForVerification = { ...rawBody };
    delete payloadForVerification.signature;

    const provider = normalizeProvider(req.header("x-payment-provider") || rawBody.provider);
    const status = normalizeStatus(rawBody.status);
    if (!status) {
      res.status(400).json({ success: false, message: "Invalid payment callback status" });
      return;
    }

    const orderNo = String(rawBody.orderNo || rawBody.outTradeNo || "").trim();
    if (!orderNo) {
      res.status(400).json({ success: false, message: "Missing orderNo" });
      return;
    }

    const signature = String(req.header("x-payment-signature") || rawBody.signature || "").trim();
    const signatureVerified = verifyHmacSignature(payloadForVerification, signature);

    const result = await processPaymentCallback({
      provider,
      orderNo,
      status,
      callbackKey: rawBody.callbackKey == null ? undefined : String(rawBody.callbackKey),
      eventId: rawBody.eventId == null ? undefined : String(rawBody.eventId),
      providerTradeNo: rawBody.providerTradeNo == null ? String(rawBody.transactionId || rawBody.tradeNo || "") || undefined : String(rawBody.providerTradeNo),
      amountCents: rawBody.amountCents == null ? undefined : Number(rawBody.amountCents),
      signatureVerified,
      payload: rawBody,
      paidAt: parsePaidAt(rawBody.paidAt || rawBody.successTime),
    });

    if (!signatureVerified) {
      res.status(403).json({ success: false, message: "Invalid callback signature", callback: result.callback });
      return;
    }

    res.json({
      success: result.success,
      duplicate: result.duplicate,
      order: result.order,
      callback: result.callback,
    });
  } catch (error) {
    console.error("[Payments] Callback failed", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Payment callback failed" });
  }
}

export async function handleWechatPaymentNotifyRequest(req: Request, res: Response) {
  try {
    const rawBody = String((req as any).rawBody || "");
    if (!rawBody) {
      res.status(400).json({ code: "FAIL", message: "empty body" });
      return;
    }
    const parsed = JSON.parse(rawBody);
    const signatureVerified = verifyWechatSignature(rawBody, req);
    const decrypted = parsed?.resource ? decryptWechatResource(parsed.resource as WechatNotifyResource) : null;
    const result = await processPaymentCallback({
      provider: "wechat",
      orderNo: String(decrypted?.out_trade_no || "").trim(),
      status: mapWechatTradeState(decrypted?.trade_state),
      callbackKey: String(req.header("wechatpay-request-id") || parsed?.id || crypto.createHash("sha1").update(rawBody).digest("hex")),
      eventId: parsed?.id == null ? undefined : String(parsed.id),
      providerTradeNo: decrypted?.transaction_id ? String(decrypted.transaction_id) : null,
      amountCents: decrypted?.amount?.total == null ? undefined : Number(decrypted.amount.total),
      signatureVerified,
      payload: { notify: parsed, resource: decrypted },
      paidAt: parsePaidAt(decrypted?.success_time),
    });
    if (!signatureVerified) {
      res.status(403).json({ code: "FAIL", message: "invalid signature", callback: result.callback });
      return;
    }
    if (!result.success && !result.duplicate) {
      res.status(400).json({ code: "FAIL", message: result.callback?.resultMessage || "notify rejected" });
      return;
    }
    res.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("[Payments] WeChat notify failed", error);
    res.status(500).json({ code: "FAIL", message: error instanceof Error ? error.message : "wechat notify failed" });
  }
}

export async function handleAlipayPaymentNotifyRequest(req: Request, res: Response) {
  try {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const status = mapAlipayTradeState(payload.trade_status);
    if (!status) {
      res.status(200).send("success");
      return;
    }
    const signatureVerified = verifyAlipaySignature(payload);
    const result = await processPaymentCallback({
      provider: "alipay",
      orderNo: String(payload.out_trade_no || "").trim(),
      status,
      callbackKey: String(payload.notify_id || payload.trade_no || payload.out_trade_no || crypto.createHash("sha1").update(stableStringify(payload)).digest("hex")),
      eventId: payload.notify_id == null ? undefined : String(payload.notify_id),
      providerTradeNo: payload.trade_no == null ? undefined : String(payload.trade_no),
      amountCents: parseAmountToCents(payload.total_amount),
      signatureVerified,
      payload,
      paidAt: parsePaidAt(payload.gmt_payment || payload.notify_time),
    });
    if (!signatureVerified || (!result.success && !result.duplicate)) {
      res.status(400).send("failure");
      return;
    }
    res.send("success");
  } catch (error) {
    console.error("[Payments] Alipay notify failed", error);
    res.status(500).send("failure");
  }
}

export function createPaymentCallbackSignature(payload: unknown) {
  return signPayload(payload);
}
