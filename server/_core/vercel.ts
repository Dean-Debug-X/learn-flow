import express from "express";
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

function captureRawBody(req: any, _res: any, buf: Buffer) {
  req.rawBody = buf?.toString("utf8") || "";
}

function registerApiRoutes(app: ReturnType<typeof express>) {
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
      res.status(500).json({ success: false, message: "Transcode callback failed" });
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

async function createVercelApp() {
  const app = express();

  app.use(express.json({ limit: "50mb", verify: captureRawBody }));
  app.use(express.urlencoded({ limit: "50mb", extended: true, verify: captureRawBody }));

  app.get("/api/health", (_req, res) => {
    const diagnostics = getDeploymentDiagnostics("vercel");
    res.status(diagnostics.ready ? 200 : 503).json(diagnostics);
  });

  app.get("/api/healthz", (_req, res) => {
    const diagnostics = getDeploymentDiagnostics("vercel");
    res.status(diagnostics.ready ? 200 : 503).json(diagnostics);
  });

  registerApiRoutes(app);

  await reloadRuntimeConfigFromDb().catch((error) => {
    console.warn("[SystemConfig] Failed to load runtime overrides", error);
  });

  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}

const appPromise = createVercelApp().catch((error) => {
  console.error("[VercelAPI] Failed to bootstrap app", error);
  throw error;
});

export default async function handler(req: any, res: any) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error("[VercelAPI] Failed to handle request", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        success: false,
        message: "Server bootstrap failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
