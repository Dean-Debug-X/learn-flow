import fs from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk.js";
import { ENV } from "./_core/env.js";
import { canAccessMediaAsset, getMediaAssetById } from "./db.js";
import { verifyPlaybackTicket } from "./playbackTickets.js";
import { getStorageDriver, storageGet } from "./storage.js";
import { getProtectedUploadPath, getPublicUploadPath } from "./uploads.js";

function getCacheControl(accessLevel?: string | null) {
  return accessLevel === "public" ? "public, max-age=300" : "private, max-age=60";
}

function normalizeRelKey(value: string) {
  return value.replace(/^\/+/, "").replace(/\\/g, "/");
}

function safeJoinRelPath(baseDir: string, target: string) {
  const sanitizedBase = normalizeRelKey(baseDir).replace(/\/+$|^\/+$/g, "");
  const resolved = path.posix.normalize(path.posix.join(sanitizedBase || ".", target));
  if (resolved.startsWith("../") || resolved === "..") {
    throw new Error("HLS resource escapes manifest directory");
  }
  return resolved === "." ? "" : resolved.replace(/^\.\//, "");
}

function buildRequestBaseUrl(req: Request) {
  const host = req.get("host");
  if (!host) return ENV.publicAppUrl.replace(/\/+$/, "");
  return `${req.protocol}://${host}`;
}

function encodeRef(ref: HlsResourceRef) {
  return Buffer.from(JSON.stringify(ref)).toString("base64url");
}

function decodeRef(value: string): HlsResourceRef {
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const parsed = JSON.parse(decoded) as HlsResourceRef;
  if (!parsed || !parsed.kind || !parsed.value) {
    throw new Error("Invalid HLS resource reference");
  }
  if (parsed.kind !== "storage" && parsed.kind !== "local" && parsed.kind !== "remote") {
    throw new Error("Invalid HLS resource reference kind");
  }
  return parsed;
}

function isLikelyManifest(value: string, contentType?: string | null) {
  if (/\.m3u8(?:$|\?)/i.test(value)) return true;
  return Boolean(contentType && contentType.toLowerCase().includes("mpegurl"));
}

function inferContentType(value: string, fallback?: string | null) {
  if (fallback) return fallback;
  const pathname = value.split("?")[0]?.toLowerCase() ?? value.toLowerCase();
  if (pathname.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (pathname.endsWith(".ts")) return "video/mp2t";
  if (pathname.endsWith(".m4s")) return "video/iso.segment";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".aac")) return "audio/aac";
  if (pathname.endsWith(".key")) return "application/octet-stream";
  return "application/octet-stream";
}

export type ResolvedAssetTarget =
  | { mode: "redirect"; url: string }
  | { mode: "file"; filePath: string };

export type HlsResourceRef =
  | { kind: "storage"; value: string }
  | { kind: "local"; value: string }
  | { kind: "remote"; value: string };

export async function resolveAssetContentTarget(asset: Awaited<ReturnType<typeof getMediaAssetById>>): Promise<ResolvedAssetTarget> {
  if (!asset) throw new Error("Media not found");
  if (asset.source === "storage" && asset.storageKey) {
    const signed = await storageGet(asset.storageKey);
    return { mode: "redirect", url: signed.url };
  }
  if (asset.url.startsWith("/__protected__/")) {
    const relKey = asset.url.replace(/^\/__protected__\//, "");
    return { mode: "file", filePath: getProtectedUploadPath(relKey) };
  }
  if (asset.url.startsWith("/")) {
    return { mode: "redirect", url: asset.url };
  }
  return { mode: "redirect", url: asset.url };
}

async function buildAssetManifestRootRef(asset: NonNullable<Awaited<ReturnType<typeof getMediaAssetById>>>, req: Request): Promise<HlsResourceRef> {
  if (asset.hlsManifestKey) {
    const key = normalizeRelKey(asset.hlsManifestKey);
    return getStorageDriver() === "local"
      ? { kind: "local", value: key }
      : { kind: "storage", value: key };
  }
  if (asset.hlsManifestUrl) {
    if (/^https?:\/\//i.test(asset.hlsManifestUrl)) {
      return { kind: "remote", value: asset.hlsManifestUrl };
    }
    if (asset.hlsManifestUrl.startsWith("/__protected__/")) {
      return { kind: "local", value: normalizeRelKey(asset.hlsManifestUrl.replace(/^\/__protected__\//, "")) };
    }
    if (asset.hlsManifestUrl.startsWith("/uploads/")) {
      return { kind: "local", value: normalizeRelKey(asset.hlsManifestUrl.replace(/^\/uploads\//, "")) };
    }
    const baseUrl = buildRequestBaseUrl(req) || ENV.publicAppUrl;
    if (!baseUrl) {
      throw new Error("Cannot resolve relative HLS manifest URL without PUBLIC_APP_URL");
    }
    return { kind: "remote", value: new URL(asset.hlsManifestUrl, baseUrl).toString() };
  }
  throw new Error("HLS manifest is not ready");
}

function getRootScope(rootRef: HlsResourceRef) {
  if (rootRef.kind === "remote") {
    const url = new URL(rootRef.value);
    const dir = path.posix.dirname(url.pathname);
    return { kind: "remote" as const, origin: url.origin, dir };
  }
  return {
    kind: rootRef.kind,
    dir: path.posix.dirname(rootRef.value),
  } as const;
}

function assertRefWithinRoot(ref: HlsResourceRef, rootRef: HlsResourceRef) {
  const rootScope = getRootScope(rootRef);
  if (rootScope.kind === "remote") {
    if (ref.kind !== "remote") throw new Error("HLS resource kind mismatch");
    const url = new URL(ref.value);
    const normalizedPath = path.posix.normalize(url.pathname);
    const rootDir = path.posix.normalize(rootScope.dir);
    if (url.origin !== rootScope.origin) throw new Error("HLS resource origin mismatch");
    if (!(normalizedPath === rootDir || normalizedPath.startsWith(`${rootDir}/`))) {
      throw new Error("HLS resource escaped root directory");
    }
    return;
  }

  if (ref.kind !== rootScope.kind) throw new Error("HLS resource kind mismatch");
  const normalizedValue = normalizeRelKey(ref.value);
  const normalizedDir = normalizeRelKey(rootScope.dir);
  if (!(normalizedValue === normalizedDir || normalizedValue.startsWith(`${normalizedDir}/`))) {
    throw new Error("HLS resource escaped root directory");
  }
}

function isPassthroughUri(uri: string) {
  return /^(data:|skd:|mailto:|tel:)/i.test(uri);
}

function resolveChildRef(baseRef: HlsResourceRef, target: string): HlsResourceRef {
  if (!target || isPassthroughUri(target)) {
    return { kind: "remote", value: target };
  }

  if (baseRef.kind === "remote") {
    return { kind: "remote", value: new URL(target, baseRef.value).toString() };
  }

  if (/^https?:\/\//i.test(target)) {
    return { kind: "remote", value: target };
  }

  const baseDir = path.posix.dirname(baseRef.value);
  if (target.startsWith("/")) {
    return { kind: baseRef.kind, value: normalizeRelKey(target) };
  }
  return { kind: baseRef.kind, value: safeJoinRelPath(baseDir, target) };
}

async function fetchRemoteBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to fetch remote HLS resource (${response.status} ${response.statusText}): ${body}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type"),
  };
}

async function loadHlsResource(ref: HlsResourceRef) {
  if (ref.kind === "remote") {
    return fetchRemoteBuffer(ref.value);
  }

  if (ref.kind === "storage") {
    const signed = await storageGet(ref.value, { expiresInSeconds: Math.max(60, ENV.mediaTicketTtlSeconds) });
    return fetchRemoteBuffer(signed.url);
  }

  const privatePath = getProtectedUploadPath(ref.value);
  try {
    const buffer = await fs.readFile(privatePath);
    return {
      buffer,
      contentType: inferContentType(ref.value),
    };
  } catch {
    const publicPath = getPublicUploadPath(ref.value);
    const buffer = await fs.readFile(publicPath);
    return {
      buffer,
      contentType: inferContentType(ref.value),
    };
  }
}

function buildPlaybackResourceUrl(token: string, ref: HlsResourceRef) {
  return `/api/playback/ticket/${token}/hls/resource?ref=${encodeURIComponent(encodeRef(ref))}`;
}

function rewriteManifestLine(line: string, currentRef: HlsResourceRef, rootRef: HlsResourceRef, token: string) {
  if (!line.trim()) return line;

  if (line.startsWith("#")) {
    if (!line.includes('URI="')) return line;
    return line.replace(/URI="([^"]+)"/g, (_match, uriValue: string) => {
      if (isPassthroughUri(uriValue)) return `URI="${uriValue}"`;
      const resolved = resolveChildRef(currentRef, uriValue);
      if (!isPassthroughUri(resolved.value)) {
        assertRefWithinRoot(resolved, rootRef);
        return `URI="${buildPlaybackResourceUrl(token, resolved)}"`;
      }
      return `URI="${uriValue}"`;
    });
  }

  const resolved = resolveChildRef(currentRef, line.trim());
  if (isPassthroughUri(resolved.value)) return line;
  assertRefWithinRoot(resolved, rootRef);
  return buildPlaybackResourceUrl(token, resolved);
}

async function getRewrittenManifest(opts: { req: Request; token: string; currentRef: HlsResourceRef; rootRef: HlsResourceRef }) {
  const loaded = await loadHlsResource(opts.currentRef);
  const sourceText = loaded.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const rewritten = sourceText
    .split(/\r?\n/)
    .map((line) => rewriteManifestLine(line, opts.currentRef, opts.rootRef, opts.token))
    .join("\n");
  return rewritten;
}

export async function sendResolvedTarget(res: Response, target: ResolvedAssetTarget, accessLevel?: string | null) {
  res.setHeader("Cache-Control", getCacheControl(accessLevel));
  if (target.mode === "file") {
    try {
      await fs.access(target.filePath);
      res.sendFile(path.resolve(target.filePath));
      return;
    } catch {
      res.status(404).send("Protected media file not found");
      return;
    }
  }
  res.redirect(302, target.url);
}

export async function handleMediaContentRequest(req: Request, res: Response) {
  const mediaId = Number(req.params.id);
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    res.status(400).send("Invalid media id");
    return;
  }

  let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    user = null;
  }

  const result = await canAccessMediaAsset({
    mediaId,
    userId: user?.id,
    userRole: user?.role,
  });

  if (!result.asset) {
    res.status(404).send("Media not found");
    return;
  }

  if (!result.allowed) {
    res.status(403).send("You do not have access to this media asset");
    return;
  }

  try {
    const target = await resolveAssetContentTarget(result.asset);
    await sendResolvedTarget(res, target, result.asset.accessLevel);
  } catch (error) {
    console.error("[Media] Failed to resolve media content", error);
    res.status(500).send("Failed to resolve media content");
  }
}

export async function handlePlaybackTicketContentRequest(req: Request, res: Response) {
  try {
    const payload = verifyPlaybackTicket(req.params.token);
    const asset = await getMediaAssetById(payload.mediaId);
    if (!asset) {
      res.status(404).send("Media not found");
      return;
    }
    const target = await resolveAssetContentTarget(asset);
    await sendResolvedTarget(res, target, "protected");
  } catch (error) {
    res.status(403).send(error instanceof Error ? error.message : "Invalid playback ticket");
  }
}

export async function handlePlaybackTicketManifestRequest(req: Request, res: Response) {
  try {
    const payload = verifyPlaybackTicket(req.params.token);
    const asset = await getMediaAssetById(payload.mediaId);
    if (!asset) {
      res.status(404).send("Media not found");
      return;
    }
    if (asset.transcodeStatus !== "ready" || (!asset.hlsManifestKey && !asset.hlsManifestUrl)) {
      res.status(409).send("HLS manifest is not ready");
      return;
    }
    const rootRef = await buildAssetManifestRootRef(asset, req);
    const rewritten = await getRewrittenManifest({
      req,
      token: req.params.token,
      currentRef: rootRef,
      rootRef,
    });
    res.setHeader("Cache-Control", "private, max-age=15");
    res.type("application/vnd.apple.mpegurl");
    res.send(rewritten);
  } catch (error) {
    console.error("[Playback] Failed to rewrite HLS manifest", error);
    res.status(403).send(error instanceof Error ? error.message : "Invalid playback ticket");
  }
}

export async function handlePlaybackTicketHlsResourceRequest(req: Request, res: Response) {
  try {
    const payload = verifyPlaybackTicket(req.params.token);
    const encodedRef = String(req.query.ref || "");
    if (!encodedRef) {
      res.status(400).send("Missing HLS resource reference");
      return;
    }
    const asset = await getMediaAssetById(payload.mediaId);
    if (!asset) {
      res.status(404).send("Media not found");
      return;
    }
    if (asset.transcodeStatus !== "ready" || (!asset.hlsManifestKey && !asset.hlsManifestUrl)) {
      res.status(409).send("HLS manifest is not ready");
      return;
    }

    const currentRef = decodeRef(encodedRef);
    const rootRef = await buildAssetManifestRootRef(asset, req);
    if (!isPassthroughUri(currentRef.value)) {
      assertRefWithinRoot(currentRef, rootRef);
    }

    if (isLikelyManifest(currentRef.value)) {
      const rewritten = await getRewrittenManifest({
        req,
        token: req.params.token,
        currentRef,
        rootRef,
      });
      res.setHeader("Cache-Control", "private, max-age=15");
      res.type("application/vnd.apple.mpegurl");
      res.send(rewritten);
      return;
    }

    const loaded = await loadHlsResource(currentRef);
    res.setHeader("Cache-Control", "private, max-age=15");
    res.type(inferContentType(currentRef.value, loaded.contentType));
    res.send(loaded.buffer);
  } catch (error) {
    console.error("[Playback] Failed to serve HLS resource", error);
    res.status(403).send(error instanceof Error ? error.message : "Invalid HLS playback request");
  }
}
