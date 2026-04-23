import type { Request, Response } from "express";
import { sdk } from "./_core/sdk.js";
import { ENV } from "./_core/env.js";
import { getAdminRiskLiveSnapshot } from "./db.js";
import { hasAdminPermission } from "../shared/adminAccess.js";

function writeEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function handleAdminRiskStreamRequest(req: Request, res: Response) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  if (!hasAdminPermission(user as any, "system.view", ENV.ownerOpenId)) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const emitSnapshot = async () => {
    const snapshot = await getAdminRiskLiveSnapshot();
    writeEvent(res, "snapshot", snapshot);
  };

  writeEvent(res, "ready", { ok: true, userId: user.id });
  await emitSnapshot();

  const timer = setInterval(() => {
    emitSnapshot().catch((error) => {
      writeEvent(res, "error", { message: error instanceof Error ? error.message : "admin risk snapshot failed" });
    });
  }, 12000);

  const heartbeat = setInterval(() => {
    writeEvent(res, "ping", { ts: Date.now() });
  }, 25000);

  req.on("close", () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    res.end();
  });
}
