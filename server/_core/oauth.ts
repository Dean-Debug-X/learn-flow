import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import * as db from "../db.js";
import { getSessionCookieOptions } from "./cookies.js";
import { ENV } from "./env.js";
import { sdk } from "./sdk.js";

function prefersHtml(req: Request) {
  const accept = req.header("accept") || "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOAuthErrorHtml(title: string, message: string, actionHref = "/", actionLabel = "返回首页") {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeActionHref = escapeHtml(actionHref);
  const safeActionLabel = escapeHtml(actionLabel);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        color: #0f172a;
      }
      main {
        width: min(92vw, 560px);
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12);
        padding: 32px 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
        line-height: 1.3;
      }
      p {
        margin: 0;
        font-size: 15px;
        line-height: 1.7;
        color: #475569;
      }
      .actions {
        margin-top: 24px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 132px;
        border-radius: 999px;
        padding: 11px 18px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
      }
      .primary {
        background: #111827;
        color: #ffffff;
      }
      .secondary {
        border: 1px solid #cbd5e1;
        color: #334155;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <div class="actions">
        <a class="primary" href="${safeActionHref}">${safeActionLabel}</a>
        <a class="secondary" href="/">返回首页</a>
      </div>
    </main>
  </body>
</html>`;
}

function sendOAuthError(
  req: Request,
  res: Response,
  status: number,
  title: string,
  message: string,
  actionHref = "/",
  actionLabel = "返回首页"
) {
  if (!prefersHtml(req)) {
    res.status(status).json({ error: title, message });
    return;
  }

  res
    .status(status)
    .type("html")
    .send(renderOAuthErrorHtml(title, message, actionHref, actionLabel));
}

function maskIdentifier(value: string) {
  if (value.length <= 4) return `${value[0] ?? "*"}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function buildAbsoluteUrl(req: Request, pathname: string) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : req.protocol || "https";
  const host =
    typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"]
      : req.headers.host;

  const base = ENV.publicAppUrl || (host ? `${proto}://${host}` : "");
  return new URL(pathname, base.endsWith("/") ? base : `${base}/`).toString();
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    if (!ENV.oAuthServerUrl || !ENV.appId) {
      console.warn("[OAuth] Login blocked because OAuth is not configured");
      sendOAuthError(
        req,
        res,
        503,
        "登录暂时不可用",
        "当前生产环境还没有完成 OAuth 配置。请先补齐 OAUTH_SERVER_URL、VITE_APP_ID 和 PUBLIC_APP_URL，再重新发起登录。",
        "/",
        "稍后再试"
      );
      return;
    }

    try {
      const redirectUri = buildAbsoluteUrl(req, "/api/oauth/callback");
      const state = Buffer.from(redirectUri, "utf8").toString("base64");
      const url = new URL("/app-auth", ENV.oAuthServerUrl);
      url.searchParams.set("appId", ENV.appId);
      url.searchParams.set("redirectUri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("type", "signIn");
      console.info("[OAuth] Login started", {
        appId: ENV.appId,
        redirectUri,
      });
      res.redirect(302, url.toString());
    } catch (error) {
      console.error("[OAuth] Login redirect failed", error);
      sendOAuthError(
        req,
        res,
        500,
        "登录跳转失败",
        "站点未能正确生成登录跳转地址。请检查 PUBLIC_APP_URL、代理头和 OAuth 服务地址配置。",
        "/",
        "返回首页"
      );
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      sendOAuthError(
        req,
        res,
        400,
        "登录回调无效",
        "登录回调缺少必要参数，请重新发起登录。",
        "/api/oauth/login",
        "重新登录"
      );
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        sendOAuthError(
          req,
          res,
          400,
          "登录信息不完整",
          "OAuth 服务返回的用户信息缺少 openId，无法建立站内登录态。",
          "/api/oauth/login",
          "重新登录"
        );
        return;
      }

      try {
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: new Date(),
        });
      } catch (error) {
        console.error("[OAuth] User sync failed during callback", {
          openId: maskIdentifier(userInfo.openId),
          error,
        });
        throw error;
      }

      const persistedUser = await db.getUserByOpenId(userInfo.openId);
      if (!persistedUser) {
        throw new Error("User record was not found after OAuth upsert");
      }

      const sessionToken = await sdk.createUserSessionToken(persistedUser.id, {
        name: userInfo.name || userInfo.email || userInfo.openId,
        openId: persistedUser.openId,
        sessionVersion: persistedUser.sessionVersion ?? 0,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      console.info("[OAuth] Callback succeeded", {
        openId: maskIdentifier(userInfo.openId),
        hasDisplayName: Boolean(userInfo.name?.trim()),
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      sendOAuthError(
        req,
        res,
        500,
        "登录未完成",
        "站点在处理登录回调时出错。请稍后重试；如果问题持续存在，请检查 OAuth 配置和数据库连接。",
        "/api/oauth/login",
        "重新登录"
      );
    }
  });
}
