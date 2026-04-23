import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressInfo } from "node:net";
import { COOKIE_NAME } from "../shared/const.js";
import * as db from "./db.js";
import { ENV } from "./_core/env.js";
import { registerOAuthRoutes } from "./_core/oauth.js";
import { sdk } from "./_core/sdk.js";

type EnvSnapshot = Pick<
  typeof ENV,
  "appId" | "oAuthServerUrl" | "publicAppUrl" | "cookieSecret"
>;

const originalEnv: EnvSnapshot = {
  appId: ENV.appId,
  oAuthServerUrl: ENV.oAuthServerUrl,
  publicAppUrl: ENV.publicAppUrl,
  cookieSecret: ENV.cookieSecret,
};

function createServer() {
  const app = express();
  registerOAuthRoutes(app);
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

describe("oauth routes", () => {
  beforeEach(() => {
    ENV.appId = originalEnv.appId;
    ENV.oAuthServerUrl = originalEnv.oAuthServerUrl;
    ENV.publicAppUrl = originalEnv.publicAppUrl;
    ENV.cookieSecret = originalEnv.cookieSecret;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a readable html error page when oauth is not configured", async () => {
    ENV.appId = "";
    ENV.oAuthServerUrl = "";

    const server = createServer();

    try {
      const response = await fetch(`${getBaseUrl(server)}/api/oauth/login`, {
        headers: { accept: "text/html" },
        redirect: "manual",
      });
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(body).toContain("登录暂时不可用");
      expect(body).toContain("OAUTH_SERVER_URL");
    } finally {
      await closeServer(server);
    }
  });

  it("redirects to the oauth provider when configuration is complete", async () => {
    ENV.appId = "app_live_123";
    ENV.oAuthServerUrl = "https://oauth.example.com";
    ENV.publicAppUrl = "https://learn-flow-weld.vercel.app";

    const server = createServer();

    try {
      const response = await fetch(`${getBaseUrl(server)}/api/oauth/login`, {
        headers: { accept: "text/html" },
        redirect: "manual",
      });

      expect(response.status).toBe(302);

      const location = response.headers.get("location");
      expect(location).toBeTruthy();

      const target = new URL(location!);
      expect(target.origin).toBe("https://oauth.example.com");
      expect(target.pathname).toBe("/app-auth");
      expect(target.searchParams.get("appId")).toBe("app_live_123");
      expect(target.searchParams.get("redirectUri")).toBe(
        "https://learn-flow-weld.vercel.app/api/oauth/callback"
      );
      expect(target.searchParams.get("state")).toBe(
        Buffer.from(
          "https://learn-flow-weld.vercel.app/api/oauth/callback",
          "utf8"
        ).toString("base64")
      );
      expect(target.searchParams.get("type")).toBe("signIn");
    } finally {
      await closeServer(server);
    }
  });

  it("sets the session cookie and redirects home after a successful callback", async () => {
    ENV.appId = "app_live_123";
    ENV.oAuthServerUrl = "https://oauth.example.com";
    ENV.publicAppUrl = "https://learn-flow-weld.vercel.app";
    ENV.cookieSecret = "test-secret";

    vi.spyOn(sdk, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      scope: "openid",
      tokenType: "Bearer",
    } as any);
    vi.spyOn(sdk, "getUserInfo").mockResolvedValue({
      openId: "owner-open-id",
      email: "owner@example.com",
      name: "",
      platform: "manus",
      loginMethod: "manus",
    } as any);
    vi.spyOn(sdk, "createUserSessionToken").mockResolvedValue("session-token");
    const upsertUserSpy = vi.spyOn(db, "upsertUser").mockResolvedValue(undefined as never);
    vi.spyOn(db, "getUserByOpenId").mockResolvedValue({
      id: 7,
      openId: "owner-open-id",
      email: "owner@example.com",
      name: null,
      loginMethod: "manus",
      role: "user",
      sessionVersion: 0,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any);

    const server = createServer();
    const state = Buffer.from(
      "https://learn-flow-weld.vercel.app/api/oauth/callback",
      "utf8"
    ).toString("base64");

    try {
      const response = await fetch(
        `${getBaseUrl(server)}/api/oauth/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
        {
          headers: {
            accept: "text/html",
            "x-forwarded-proto": "https",
          },
          redirect: "manual",
        }
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toContain(`${COOKIE_NAME}=session-token`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=None");

      expect(upsertUserSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          openId: "owner-open-id",
          email: "owner@example.com",
          name: null,
          loginMethod: "manus",
        })
      );
      expect(sdk.createUserSessionToken).toHaveBeenCalledWith(7, {
        name: "owner@example.com",
        openId: "owner-open-id",
        sessionVersion: 0,
        expiresInMs: expect.any(Number),
      });
    } finally {
      await closeServer(server);
    }
  });
});
