import { beforeEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env.js";
import {
  buildWeChatLocalOpenId,
  createWeChatLoginState,
  verifyWeChatLoginState,
} from "./authWechat.js";

type EnvSnapshot = Pick<typeof ENV, "cookieSecret" | "wechatLoginAppId">;

const originalEnv: EnvSnapshot = {
  cookieSecret: ENV.cookieSecret,
  wechatLoginAppId: ENV.wechatLoginAppId,
};

describe("wechat auth helpers", () => {
  beforeEach(() => {
    ENV.cookieSecret = originalEnv.cookieSecret;
    ENV.wechatLoginAppId = originalEnv.wechatLoginAppId;
  });

  it("builds deterministic local open ids within the legacy column limit", () => {
    ENV.wechatLoginAppId = "wx123456";
    const first = buildWeChatLocalOpenId("openid-1", "unionid-1");
    const second = buildWeChatLocalOpenId("openid-1", "unionid-1");

    expect(first).toBe(second);
    expect(first.startsWith("wechat_")).toBe(true);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it("round-trips a signed wechat login state token", async () => {
    ENV.cookieSecret = "wechat-state-secret";
    const token = await createWeChatLoginState("/pricing");
    const payload = await verifyWeChatLoginState(token);

    expect(payload.redirectTarget).toBe("/pricing");
    expect(payload.nonce.length).toBeGreaterThan(10);
  });
});
