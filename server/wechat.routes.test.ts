import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressInfo } from "node:net";
import { COOKIE_NAME } from "../shared/const.js";
import { ENV } from "./_core/env.js";
import { sdk } from "./_core/sdk.js";
import { registerWeChatAuthRoutes } from "./_core/wechatAuth.js";
import * as wechatAuth from "./authWechat.js";

type EnvSnapshot = Pick<
  typeof ENV,
  | "cookieSecret"
  | "publicAppUrl"
  | "wechatLoginAppId"
  | "wechatLoginAppSecret"
  | "wechatLoginRedirectUri"
>;

const originalEnv: EnvSnapshot = {
  cookieSecret: ENV.cookieSecret,
  publicAppUrl: ENV.publicAppUrl,
  wechatLoginAppId: ENV.wechatLoginAppId,
  wechatLoginAppSecret: ENV.wechatLoginAppSecret,
  wechatLoginRedirectUri: ENV.wechatLoginRedirectUri,
};

function createServer() {
  const app = express();
  registerWeChatAuthRoutes(app);
  return app.listen(0);
}

function getBaseUrl(server: ReturnType<typeof createServer>) {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("wechat auth routes", () => {
  beforeEach(() => {
    ENV.cookieSecret = originalEnv.cookieSecret;
    ENV.publicAppUrl = originalEnv.publicAppUrl;
    ENV.wechatLoginAppId = originalEnv.wechatLoginAppId;
    ENV.wechatLoginAppSecret = originalEnv.wechatLoginAppSecret;
    ENV.wechatLoginRedirectUri = originalEnv.wechatLoginRedirectUri;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a readable error page when wechat login is not configured", async () => {
    ENV.wechatLoginAppId = "";
    ENV.wechatLoginAppSecret = "";
    ENV.wechatLoginRedirectUri = "";

    const server = createServer();

    try {
      const response = await fetch(`${getBaseUrl(server)}/api/auth/wechat/login`, {
        headers: { accept: "text/html" },
        redirect: "manual",
      });
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(body).toContain("WeChat Login Unavailable");
      expect(body).toContain("WECHAT_LOGIN_APP_ID");
    } finally {
      await closeServer(server);
    }
  });

  it("redirects to the official wechat qr login url when configured", async () => {
    ENV.cookieSecret = "wechat-route-secret";
    ENV.wechatLoginAppId = "wx_app_123";
    ENV.wechatLoginAppSecret = "wx_secret_123";
    ENV.wechatLoginRedirectUri =
      "https://learn-flow-weld.vercel.app/api/auth/wechat/callback";

    const server = createServer();

    try {
      const response = await fetch(
        `${getBaseUrl(server)}/api/auth/wechat/login?redirect=%2Fpricing`,
        {
          headers: { accept: "text/html" },
          redirect: "manual",
        }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBeTruthy();
      expect(location).toContain("#wechat_redirect");

      const parsed = new URL(location!.replace("#wechat_redirect", ""));
      expect(parsed.origin).toBe("https://open.weixin.qq.com");
      expect(parsed.pathname).toBe("/connect/qrconnect");
      expect(parsed.searchParams.get("appid")).toBe("wx_app_123");
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        "https://learn-flow-weld.vercel.app/api/auth/wechat/callback"
      );
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toBe("snsapi_login");

      const state = parsed.searchParams.get("state");
      expect(state).toBeTruthy();
      const payload = await wechatAuth.verifyWeChatLoginState(state!);
      expect(payload.redirectTarget).toBe("/pricing");
    } finally {
      await closeServer(server);
    }
  });

  it("sets the session cookie and redirects to the original page after a successful callback", async () => {
    vi.spyOn(wechatAuth, "completeWeChatLogin").mockResolvedValue({
      user: {
        id: 12,
        openId: "wechat_local_user",
        name: "WeChat User",
        email: null,
        phone: null,
        avatarUrl: null,
        loginMethod: "wechat_open",
        role: "user",
        adminLevel: null,
        status: "active",
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      redirectTarget: "/pricing",
      profile: {
        openId: "wx-open-id",
        unionId: "wx-union-id",
        nickname: "WeChat User",
        avatarUrl: null,
        country: null,
        province: null,
        city: null,
      },
    } as any);
    vi.spyOn(sdk, "createUserSessionToken").mockResolvedValue("wechat-session");

    const server = createServer();

    try {
      const response = await fetch(
        `${getBaseUrl(server)}/api/auth/wechat/callback?code=wechat-code&state=state-token`,
        {
          headers: {
            accept: "text/html",
            "x-forwarded-proto": "https",
          },
          redirect: "manual",
        }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/pricing");

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toContain(`${COOKIE_NAME}=wechat-session`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");

      expect(wechatAuth.completeWeChatLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "wechat-code",
          state: "state-token",
        })
      );
    } finally {
      await closeServer(server);
    }
  });
});
