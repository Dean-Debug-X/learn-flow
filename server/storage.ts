import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from './_core/env';

type StorageConfig = { baseUrl: string; apiKey: string };
export type StorageDriver = "local" | "forge" | "s3";

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const segmentStart = relKey.lastIndexOf("/");
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1 || lastDot <= segmentStart) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

function getS3Client() {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) return null;
  return new S3Client({
    region: ENV.s3Region || "auto",
    endpoint: ENV.s3Endpoint || undefined,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
    forcePathStyle: Boolean(ENV.s3Endpoint),
  });
}

export function getStorageDriver(): StorageDriver {
  if (ENV.storageDriver === "forge") return "forge";
  if (ENV.storageDriver === "s3") return "s3";
  if (ENV.storageDriver === "local") return "local";
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return "forge";
  if (ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey) return "s3";
  return "local";
}

export function storageSupportsDirectUpload() {
  return getStorageDriver() === "s3";
}

export function buildStorageObjectUrl(relKey: string): string {
  const key = normalizeKey(relKey);
  if (ENV.s3PublicBaseUrl) {
    return `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }
  if (ENV.s3Endpoint && ENV.s3Bucket) {
    return `${ENV.s3Endpoint.replace(/\/+$/, "")}/${ENV.s3Bucket}/${key}`;
  }
  if (ENV.s3Bucket && ENV.s3Region && ENV.s3Region !== "auto") {
    return `https://${ENV.s3Bucket}.s3.${ENV.s3Region}.amazonaws.com/${key}`;
  }
  if (ENV.s3Bucket) {
    return `s3://${ENV.s3Bucket}/${key}`;
  }
  return key;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const driver = getStorageDriver();
  const key = appendHashSuffix(normalizeKey(relKey));

  if (driver === "forge") {
    const { baseUrl, apiKey } = getStorageConfig();
    const uploadUrl = buildUploadUrl(baseUrl, key);
    const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: formData,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(
        `Storage upload failed (${response.status} ${response.statusText}): ${message}`
      );
    }
    const url = (await response.json()).url;
    return { key, url };
  }

  if (driver === "s3") {
    const client = getS3Client();
    if (!client || !ENV.s3Bucket) throw new Error("S3 storage is not configured");
    const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);
    await client.send(
      new PutObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return { key, url: buildStorageObjectUrl(key) };
  }

  throw new Error("storagePut called without object storage configuration");
}

export async function storageGet(
  relKey: string,
  opts: { expiresInSeconds?: number } = {}
): Promise<{ key: string; url: string }> {
  const driver = getStorageDriver();
  const key = normalizeKey(relKey);
  const expiresInSeconds = opts.expiresInSeconds ?? ENV.signedUrlTtlSeconds;

  if (driver === "forge") {
    const { baseUrl, apiKey } = getStorageConfig();
    return {
      key,
      url: await buildDownloadUrl(baseUrl, key, apiKey),
    };
  }

  if (driver === "s3") {
    const client = getS3Client();
    if (!client || !ENV.s3Bucket) throw new Error("S3 storage is not configured");
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds }
    );
    return { key, url };
  }

  return {
    key,
    url: key.startsWith("uploads/") ? `/${key}` : `/uploads/${key}`,
  };
}

export async function createDirectUploadUrl(opts: {
  relKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  objectUrl: string;
}> {
  if (getStorageDriver() !== "s3") {
    throw new Error("Direct upload is only supported when STORAGE_DRIVER=s3");
  }
  const client = getS3Client();
  if (!client || !ENV.s3Bucket) throw new Error("S3 storage is not configured");
  const key = appendHashSuffix(normalizeKey(opts.relKey));
  const expiresInSeconds = opts.expiresInSeconds ?? 900;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      ContentType: opts.contentType,
    }),
    { expiresIn: expiresInSeconds }
  );
  return {
    key,
    uploadUrl,
    method: "PUT",
    headers: { "Content-Type": opts.contentType },
    objectUrl: buildStorageObjectUrl(key),
  };
}
