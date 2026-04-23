import crypto from "node:crypto";
import { canAccessMediaAsset } from "./db.js";
import { ENV } from "./_core/env.js";

export type PlaybackTicketPayload = {
  v: 1;
  mediaId: number;
  userId: number | null;
  exp: number;
};

function getSecret() {
  return ENV.mediaTicketSecret || ENV.cookieSecret || "learnflow-media-ticket-dev-secret";
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createPlaybackTicket(payload: Omit<PlaybackTicketPayload, "v">) {
  const body: PlaybackTicketPayload = { v: 1, ...payload };
  const encoded = encodeBase64Url(JSON.stringify(body));
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

export function verifyPlaybackTicket(token: string): PlaybackTicketPayload {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new Error("Invalid playback ticket format");
  }
  const expected = signValue(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid playback ticket signature");
  }
  const valid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!valid) {
    throw new Error("Invalid playback ticket signature");
  }
  const payload = JSON.parse(decodeBase64Url(encoded)) as PlaybackTicketPayload;
  if (!payload?.mediaId || !payload?.exp) {
    throw new Error("Invalid playback ticket payload");
  }
  if (Date.now() > payload.exp) {
    throw new Error("Playback ticket expired");
  }
  return payload;
}

export async function issuePlaybackTicket(opts: {
  mediaId: number;
  userId?: number | null;
  userRole?: "user" | "admin" | null;
  preferHls?: boolean;
}) {
  const access = await canAccessMediaAsset({
    mediaId: opts.mediaId,
    userId: opts.userId,
    userRole: opts.userRole,
  });

  if (!access.asset) {
    throw new Error("媒体不存在");
  }
  if (!access.allowed) {
    throw new Error("当前账号无权播放该媒体");
  }

  const exp = Date.now() + ENV.mediaTicketTtlSeconds * 1000;
  const token = createPlaybackTicket({
    mediaId: opts.mediaId,
    userId: opts.userId ?? null,
    exp,
  });
  const hlsReady =
    access.asset.transcodeStatus === "ready" &&
    Boolean(access.asset.hlsManifestUrl || access.asset.hlsManifestKey);

  return {
    token,
    expiresAt: new Date(exp).toISOString(),
    playbackType: opts.preferHls !== false && hlsReady ? ("hls" as const) : ("direct" as const),
    transcodeStatus: access.asset.transcodeStatus,
    hlsReady,
    contentUrl: `/api/playback/ticket/${token}/content`,
    manifestUrl: hlsReady ? `/api/playback/ticket/${token}/manifest.m3u8` : null,
    posterUrl: access.asset.posterUrl ?? null,
  };
}
