import type { Request, Response } from "express";
import { sdk } from "./_core/sdk.js";
import { getUserNotificationLiveSnapshot } from "./db.js";

function writeEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}
`);
  res.write(`data: ${JSON.stringify(data)}

`);
}

export async function handleNotificationStreamRequest(req: Request, res: Response) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const emitSnapshot = async () => {
    const snapshot = await getUserNotificationLiveSnapshot(user.id);
    writeEvent(res, "snapshot", snapshot);
  };

  writeEvent(res, "ready", { ok: true, userId: user.id });
  await emitSnapshot();

  const timer = setInterval(() => {
    emitSnapshot().catch((error) => {
      writeEvent(res, "error", { message: error instanceof Error ? error.message : "stream snapshot failed" });
    });
  }, 15000);

  const heartbeat = setInterval(() => {
    writeEvent(res, "ping", { ts: Date.now() });
  }, 25000);

  req.on("close", () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    res.end();
  });
}
