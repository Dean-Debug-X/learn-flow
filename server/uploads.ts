import fs from "node:fs/promises";
import path from "node:path";
import { getStorageDriver, storagePut } from "./storage.js";

const PUBLIC_UPLOAD_DIR = path.resolve(import.meta.dirname, "..", "uploads");
const PROTECTED_UPLOAD_DIR = path.resolve(import.meta.dirname, "..", "private_uploads");

type UploadResult = {
  key: string | null;
  url: string;
  source: "local" | "storage";
  size: number;
};

function sanitizeFileName(fileName: string) {
  const fallback = `file-${Date.now()}`;
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || fallback;
}

function stripDataUrlPrefix(value: string) {
  const index = value.indexOf(",");
  return index >= 0 ? value.slice(index + 1) : value;
}

function mimeToExtension(mimeType: string) {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/ogg": ".ogv",
    "application/pdf": ".pdf",
  };
  return map[mimeType] ?? "";
}

export function getProtectedUploadPath(relKey: string) {
  return path.join(PROTECTED_UPLOAD_DIR, relKey.replace(/^\/+/, ""));
}

export function getPublicUploadPath(relKey: string) {
  return path.join(PUBLIC_UPLOAD_DIR, relKey.replace(/^\/+/, ""));
}

export async function saveUploadedBase64File(opts: {
  base64: string;
  fileName: string;
  contentType: string;
  folder: string;
  accessLevel?: "public" | "protected";
}): Promise<UploadResult> {
  const safeName = sanitizeFileName(opts.fileName);
  const ext = path.extname(safeName) || mimeToExtension(opts.contentType);
  const baseName = path.basename(safeName, path.extname(safeName) || undefined);
  const objectName = `${baseName}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const relKey = `${opts.folder.replace(/^\/+|\/+$/g, "")}/${objectName}`;
  const buffer = Buffer.from(stripDataUrlPrefix(opts.base64), "base64");

  if (getStorageDriver() !== "local") {
    const { key, url } = await storagePut(relKey, buffer, opts.contentType);
    return { key, url, source: "storage", size: buffer.length };
  }

  const isProtected = opts.accessLevel === "protected";
  const targetRoot = isProtected ? PROTECTED_UPLOAD_DIR : PUBLIC_UPLOAD_DIR;
  const fullDir = path.join(targetRoot, opts.folder);
  await fs.mkdir(fullDir, { recursive: true });
  const filePath = path.join(fullDir, objectName);
  await fs.writeFile(filePath, buffer);

  if (isProtected) {
    return {
      key: relKey,
      url: `/__protected__/${relKey}`,
      source: "local",
      size: buffer.length,
    };
  }

  return {
    key: relKey,
    url: `/${relKey.startsWith("uploads/") ? relKey : `uploads/${relKey}`}`,
    source: "local",
    size: buffer.length,
  };
}
