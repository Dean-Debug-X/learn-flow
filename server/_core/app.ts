import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { handleAdminRiskStreamRequest } from "../adminRiskStream.js";
import { reloadRuntimeConfigFromDb } from "../db.js";
import {
  handleMediaContentRequest,
  handlePlaybackTicketContentRequest,
  handlePlaybackTicketHlsResourceRequest,
  handlePlaybackTicketManifestRequest,
} from "../mediaAccess.js";
import { handleNotificationStreamRequest } from "../notificationStream.js";
import {
  handleAlipayPaymentNotifyRequest,
  handlePaymentCallbackRequest,
  handlePaymentSessionViewRequest,
  handleWechatPaymentNotifyRequest,
} from "../payments.js";
import { appRouter } from "../routers.js";
import {
  handleTranscodeCallbackRequest,
  handleTranscodeJobSourceRequest,
} from "../transcode.js";
import { createContext } from "./context.js";
import { getDeploymentDiagnostics } from "./deployment.js";
import { registerOAuthRoutes } from "./oauth.js";
import { registerWeChatAuthRoutes } from "./wechatAuth.js";

export type AppRuntime = "development" | "node" | "vercel";

function ensureLocalAssetDirs() {
  const uploadsPath = path.resolve(import.meta.dirname, "../..", "uploads");
  const privateUploadsPath = path.resolve(import.meta.dirname, "../..", "private_uploads");

  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  if (!fs.existsSync(privateUploadsPath)) {
    fs.mkdirSync(privateUploadsPath, { recursive: true });
  }

  return { uploadsPath };
}

function captureRawBody(req: any, _res: any, buf: Buffer) {
  req.rawBody = buf?.toString("utf8") || "";
}

function registerMediaAndPaymentRoutes(app: Express, uploadsPath?: string) {
  if (uploadsPath) {
    app.use("/uploads", express.static(uploadsPath));
  }

  app.get("/api/media/:id/content", (req, res) => {
    handleMediaContentRequest(req, res).catch((error) => {
      console.error("[Media] Unhandled media error", error);
      res.status(500).send("Media request failed");
    });
  });

  app.get("/api/playback/ticket/:token/content", (req, res) => {
    handlePlaybackTicketContentRequest(req, res).catch((error) => {
      console.error("[Playback] Unhandled content ticket error", error);
      res.status(500).send("Playback content request failed");
    });
  });

  app.get("/api/playback/ticket/:token/manifest.m3u8", (req, res) => {
    handlePlaybackTicketManifestRequest(req, res).catch((error) => {
      console.error("[Playback] Unhandled manifest ticket error", error);
      res.status(500).send("Playback manifest request failed");
    });
  });

  app.get("/api/playback/ticket/:token/hls/resource", (req, res) => {
    handlePlaybackTicketHlsResourceRequest(req, res).catch((error) => {
      console.error("[Playback] Unhandled HLS resource ticket error", error);
      res.status(500).send("Playback HLS resource request failed");
    });
  });

  app.get("/api/transcode/jobs/:jobId/source", (req, res) => {
    handleTranscodeJobSourceRequest(req, res).catch((error) => {
      console.error("[Transcode] Unhandled source error", error);
      res.status(500).send("Transcode source request failed");
    });
  });

  app.post("/api/transcode/callback", (req, res) => {
    handleTranscodeCallbackRequest(req, res).catch((error) => {
      console.error("[Transcode] Unhandled callback error", error);
      res
        .status(500)
        .json({ success: false, message: "Transcode callback failed" });
    });
  });

  app.get("/api/payments/session/:token/view", (req, res) => {
    handlePaymentSessionViewRequest(req, res).catch((error) => {
      console.error("[Payments] Unhandled session view error", error);
      res.status(500).send("Payment session view failed");
    });
  });

  app.post("/api/payments/callback", (req, res) => {
    handlePaymentCallbackRequest(req, res).catch((error) => {
      console.error("[Payments] Unhandled callback error", error);
      res.status(500).json({ success: false, message: "Payment callback failed" });
    });
  });

  app.post("/api/payments/wechat/notify", (req, res) => {
    handleWechatPaymentNotifyRequest(req, res).catch((error) => {
      console.error("[Payments] Unhandled WeChat notify error", error);
      res.status(500).json({ code: "FAIL", message: "WeChat notify failed" });
    });
  });

  app.post("/api/payments/alipay/notify", (req, res) => {
    handleAlipayPaymentNotifyRequest(req, res).catch((error) => {
      console.error("[Payments] Unhandled Alipay notify error", error);
      res.status(500).send("failure");
    });
  });

  app.get("/api/notifications/stream", (req, res) => {
    handleNotificationStreamRequest(req, res).catch((error) => {
      console.error("[Notifications] Unhandled stream error", error);
      res.status(500).end();
    });
  });

  app.get("/api/admin/risk/stream", (req, res) => {
    handleAdminRiskStreamRequest(req, res).catch((error) => {
      console.error("[AdminRisk] Unhandled stream error", error);
      res.status(500).end();
    });
  });
}

export async function createApp(options: {
  runtime?: AppRuntime;
  server?: Server;
} = {}) {
  const runtime =
    options.runtime ?? (process.env.NODE_ENV === "development" ? "development" : "node");
  const app = express();
  const uploadsPath = runtime === "vercel" ? undefined : ensureLocalAssetDirs().uploadsPath;
  const healthRuntime = runtime;

  app.use(express.json({ limit: "50mb", verify: captureRawBody }));
  app.use(express.urlencoded({ limit: "50mb", extended: true, verify: captureRawBody }));

  app.get("/api/health", (_req, res) => {
    const diagnostics = getDeploymentDiagnostics(healthRuntime);
    res.status(diagnostics.ready ? 200 : 503).json(diagnostics);
  });

  app.get("/api/healthz", (_req, res) => {
    const diagnostics = getDeploymentDiagnostics(healthRuntime);
    res.status(diagnostics.ready ? 200 : 503).json(diagnostics);
  });

  registerMediaAndPaymentRoutes(app, uploadsPath);

  await reloadRuntimeConfigFromDb().catch((error) => {
    console.warn("[SystemConfig] Failed to load runtime overrides", error);
  });

  registerOAuthRoutes(app);
  registerWeChatAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (runtime === "development") {
    if (!options.server) {
      throw new Error("Development runtime requires a Node HTTP server");
    }
    const { setupVite } = await import("./vite.js");
    await setupVite(app, options.server);
  } else if (runtime === "node") {
    const { serveStatic } = await import("./vite.js");
    serveStatic(app);
  }

  return app;
}
