import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  applyTranscodeJobCallback,
  getMediaAssetById,
  getTranscodeJobById,
  markTranscodeJobDispatched,
} from "./db.js";
import { resolveAssetContentTarget, sendResolvedTarget } from "./mediaAccess.js";
import { storageGet } from "./storage.js";
import { ENV } from "./_core/env.js";

function getTokenSecret() {
  return ENV.transcodeCallbackSecret || ENV.cookieSecret || "learnflow-transcode-dev-secret";
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string) {
  return crypto.createHmac("sha256", getTokenSecret()).update(value).digest("base64url");
}

type TranscodeSourceTokenPayload = {
  v: 1;
  jobId: number;
  exp: number;
};

function createTranscodeSourceToken(payload: Omit<TranscodeSourceTokenPayload, "v">) {
  const body: TranscodeSourceTokenPayload = { v: 1, ...payload };
  const encoded = encodeBase64Url(JSON.stringify(body));
  return `${encoded}.${signValue(encoded)}`;
}

function verifyTranscodeSourceToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Invalid transcode source token");
  const expected = signValue(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) throw new Error("Invalid transcode source token");
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) throw new Error("Invalid transcode source token");
  const payload = JSON.parse(decodeBase64Url(encoded)) as TranscodeSourceTokenPayload;
  if (!payload?.jobId || !payload?.exp) throw new Error("Invalid transcode source token payload");
  if (Date.now() > payload.exp) throw new Error("Transcode source token expired");
  return payload;
}

function getPublicBaseUrl() {
  return ENV.publicAppUrl.replace(/\/+$/, "");
}

async function buildSourceUrl(jobId: number, asset: Awaited<ReturnType<typeof getMediaAssetById>>) {
  if (!asset) return null;
  const baseUrl = getPublicBaseUrl();
  if (baseUrl) {
    const token = createTranscodeSourceToken({
      jobId,
      exp: Date.now() + ENV.transcodeSourceTtlSeconds * 1000,
    });
    return `${baseUrl}/api/transcode/jobs/${jobId}/source?token=${encodeURIComponent(token)}`;
  }
  if (asset.source === "storage" && asset.storageKey) {
    const signed = await storageGet(asset.storageKey, { expiresInSeconds: ENV.transcodeSourceTtlSeconds });
    return signed.url;
  }
  if (/^https?:\/\//i.test(asset.url)) return asset.url;
  return null;
}

function buildCallbackUrl() {
  const baseUrl = getPublicBaseUrl();
  return baseUrl ? `${baseUrl}/api/transcode/callback` : null;
}

export async function dispatchTranscodeJob(jobId: number) {
  const job = await getTranscodeJobById(jobId);
  if (!job) throw new Error("转码任务不存在");
  if (!job.asset?.id) throw new Error("转码任务未关联媒体资源");

  const sourceUrl = await buildSourceUrl(jobId, await getMediaAssetById(job.mediaId));
  const callbackUrl = buildCallbackUrl();
  const warnings: string[] = [];

  if (!sourceUrl) warnings.push("当前环境无法生成可供外部转码器拉取的源文件地址，请配置 PUBLIC_APP_URL 或使用对象存储。");
  if (!callbackUrl) warnings.push("当前环境未配置 PUBLIC_APP_URL，外部转码器无法回调到本站。");

  const payload = {
    jobId: job.id,
    mediaId: job.mediaId,
    profile: job.profile,
    output: {
      prefix: job.outputPrefix || `transcoded/media-${job.mediaId}/${job.id}`,
    },
    input: {
      sourceUrl,
      assetId: job.asset.id,
      fileName: job.asset.originName,
      mimeType: null,
    },
    callback: {
      url: callbackUrl,
      token: job.callbackToken,
      secret: ENV.transcodeCallbackSecret || undefined,
    },
    warnings,
  };

  if (ENV.transcodeWebhookUrl) {
    if (!sourceUrl) throw new Error("自动派发失败：缺少转码源地址，请配置 PUBLIC_APP_URL 或对象存储");
    if (!callbackUrl) throw new Error("自动派发失败：缺少 PUBLIC_APP_URL，无法接收转码回调");

    const response = await fetch(ENV.transcodeWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const rawText = await response.text();
    let providerResponse: any = null;
    try {
      providerResponse = rawText ? JSON.parse(rawText) : null;
    } catch {
      providerResponse = rawText;
    }
    if (!response.ok) {
      throw new Error(`转码派发失败（${response.status} ${response.statusText}）: ${rawText}`);
    }
    const updated = await markTranscodeJobDispatched(jobId, {
      provider: "webhook",
      externalJobId: providerResponse?.jobId ?? providerResponse?.externalJobId ?? null,
      requestPayload: payload,
      responsePayload: providerResponse,
    });
    return { mode: "webhook" as const, payload, providerResponse, job: updated };
  }

  const updated = await markTranscodeJobDispatched(jobId, {
    provider: ENV.transcodeProvider === "custom" ? "custom" : "manual",
    requestPayload: payload,
    responsePayload: warnings.length ? { warnings } : { mode: "manual" },
  });

  return { mode: "manual" as const, payload, providerResponse: null, job: updated };
}

export async function handleTranscodeJobSourceRequest(req: Request, res: Response) {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      res.status(400).send("Invalid transcode job id");
      return;
    }
    const token = String(req.query.token || "");
    const payload = verifyTranscodeSourceToken(token);
    if (payload.jobId !== jobId) {
      res.status(403).send("Invalid transcode source token");
      return;
    }
    const job = await getTranscodeJobById(jobId);
    if (!job) {
      res.status(404).send("Transcode job not found");
      return;
    }
    const asset = await getMediaAssetById(job.mediaId);
    if (!asset) {
      res.status(404).send("Media not found");
      return;
    }
    const target = await resolveAssetContentTarget(asset);
    await sendResolvedTarget(res, target, "protected");
  } catch (error) {
    res.status(403).send(error instanceof Error ? error.message : "Invalid transcode source token");
  }
}

export async function handleTranscodeCallbackRequest(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = Number(body.jobId ?? req.query.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      res.status(400).json({ success: false, message: "Missing or invalid jobId" });
      return;
    }
    const job = await getTranscodeJobById(jobId);
    if (!job) {
      res.status(404).json({ success: false, message: "Transcode job not found" });
      return;
    }

    const expectedSecret = ENV.transcodeCallbackSecret;
    const providedSecret = req.header("x-transcode-callback-secret") || String(body.callbackSecret || "");
    if (expectedSecret && providedSecret !== expectedSecret) {
      res.status(403).json({ success: false, message: "Invalid callback secret" });
      return;
    }

    const callbackToken = req.header("x-transcode-callback-token") || String(body.callbackToken || "");
    if (!callbackToken || callbackToken !== job.callbackToken) {
      res.status(403).json({ success: false, message: "Invalid callback token" });
      return;
    }

    const rawStatus = String(body.status || "").toLowerCase();
    const status = rawStatus === "processing" || rawStatus === "ready" || rawStatus === "failed" || rawStatus === "cancelled"
      ? rawStatus
      : null;
    if (!status) {
      res.status(400).json({ success: false, message: "Invalid callback status" });
      return;
    }

    const result = await applyTranscodeJobCallback({
      jobId,
      callbackToken,
      status,
      progress: body.progress == null ? undefined : Number(body.progress),
      externalJobId: body.externalJobId == null ? undefined : String(body.externalJobId),
      posterUrl: body.posterUrl == null ? undefined : String(body.posterUrl),
      hlsManifestKey: body.hlsManifestKey == null ? undefined : String(body.hlsManifestKey),
      hlsManifestUrl: body.hlsManifestUrl == null ? undefined : String(body.hlsManifestUrl),
      errorMessage: body.errorMessage == null ? undefined : String(body.errorMessage),
      responsePayload: body,
    });

    res.json({ success: true, job: result.job, asset: result.asset });
  } catch (error) {
    console.error("[Transcode] Callback failed", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Callback failed" });
  }
}
