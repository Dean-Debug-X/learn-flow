import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import * as wechatAuth from "../authWechat.js";
import { getSessionCookieOptions } from "./cookies.js";
import {
  buildAbsoluteUrl,
  getQueryParam,
  maskIdentifier,
  normalizeRelativeRedirectTarget,
  sendAuthError,
} from "./authPages.js";
import { ENV } from "./env.js";
import { sdk } from "./sdk.js";

function getRequestIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(",")[0].trim();
  }
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function getRequestUserAgent(req: Request) {
  const userAgent = req.headers["user-agent"];
  if (!userAgent) return null;
  return Array.isArray(userAgent) ? userAgent[0] : userAgent;
}

function resolveWeChatError(error: unknown) {
  if (error instanceof wechatAuth.WeChatAuthError) {
    return {
      status: error.status,
      title: "WeChat Login Failed",
      message: error.message,
    };
  }

  return {
    status: 500,
    title: "WeChat Login Failed",
    message: "The site hit an unexpected error while handling WeChat login.",
  };
}

export function registerWeChatAuthRoutes(app: Express) {
  app.get("/api/auth/wechat/login", async (req: Request, res: Response) => {
    if (!wechatAuth.isWeChatLoginConfigured()) {
      sendAuthError(
        req,
        res,
        503,
        "WeChat Login Unavailable",
        "Configure WECHAT_LOGIN_APP_ID, WECHAT_LOGIN_APP_SECRET, and WECHAT_LOGIN_REDIRECT_URI before enabling WeChat login.",
        "/login",
        "Back to Login"
      );
      return;
    }

    try {
      const redirectTarget = normalizeRelativeRedirectTarget(
        getQueryParam(req, "redirect")
      );
      const redirectUri =
        ENV.wechatLoginRedirectUri ||
        buildAbsoluteUrl(req, "/api/auth/wechat/callback");
      const state = await wechatAuth.createWeChatLoginState(redirectTarget);
      const location = wechatAuth.buildWeChatLoginUrl(state, redirectUri);
      console.info("[WeChatAuth] Login started", {
        redirectTarget,
        redirectUri,
      });
      res.redirect(302, location);
    } catch (error) {
      console.error("[WeChatAuth] Login redirect failed", error);
      sendAuthError(
        req,
        res,
        500,
        "WeChat Login Redirect Failed",
        "The site could not create the WeChat login redirect. Please verify the callback URL and app configuration.",
        "/login",
        "Back to Login"
      );
    }
  });

  app.get("/api/auth/wechat/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      sendAuthError(
        req,
        res,
        400,
        "WeChat Callback Invalid",
        "The callback is missing the required code or state parameter.",
        "/login",
        "Try Login Again"
      );
      return;
    }

    try {
      const result = await wechatAuth.completeWeChatLogin({
        code,
        state,
        requestIp: getRequestIp(req),
        userAgent: getRequestUserAgent(req),
      });

      const sessionToken = await sdk.createUserSessionToken(result.user.id, {
        name:
          result.user.name ||
          result.profile.nickname ||
          result.user.email ||
          result.user.phone ||
          result.user.openId,
        openId: result.user.openId,
        sessionVersion: result.user.sessionVersion ?? 0,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      console.info("[WeChatAuth] Callback succeeded", {
        openId: maskIdentifier(result.profile.openId),
        hasUnionId: Boolean(result.profile.unionId),
        redirectTarget: result.redirectTarget,
      });

      res.redirect(302, result.redirectTarget);
    } catch (error) {
      const resolved = resolveWeChatError(error);
      console.error("[WeChatAuth] Callback failed", error);
      sendAuthError(
        req,
        res,
        resolved.status,
        resolved.title,
        resolved.message,
        "/login",
        "Back to Login"
      );
    }
  });
}
