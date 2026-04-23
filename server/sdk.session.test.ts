import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env.js";
import { sdk } from "./_core/sdk.js";

const originalEnv = {
  appId: ENV.appId,
  cookieSecret: ENV.cookieSecret,
};

describe("sdk session compatibility", () => {
  beforeEach(() => {
    ENV.appId = "app_session_test";
    ENV.cookieSecret = "session-secret";
  });

  afterEach(() => {
    ENV.appId = originalEnv.appId;
    ENV.cookieSecret = originalEnv.cookieSecret;
  });

  it("accepts a session token even when the name claim is missing", async () => {
    const token = await sdk.signSession({
      openId: "user-open-id",
      appId: "app_session_test",
    });

    const session = await sdk.verifySession(token);

    expect(session).toEqual({
      userId: null,
      openId: "user-open-id",
      appId: "app_session_test",
      name: "",
      sessionVersion: 0,
    });
  });

  it("uses a stable fallback name when creating a session token", async () => {
    const token = await sdk.createSessionToken("user-open-id", {
      name: "   ",
    });

    const session = await sdk.verifySession(token);

    expect(session).toEqual({
      userId: null,
      openId: "user-open-id",
      appId: "app_session_test",
      name: "user-open-id",
      sessionVersion: 0,
    });
  });

  it("supports userId-based sessions while keeping the legacy openId for compatibility", async () => {
    const token = await sdk.createUserSessionToken(42, {
      openId: "legacy-open-id",
      sessionVersion: 3,
      name: "Sample User",
    });

    const session = await sdk.verifySession(token);

    expect(session).toEqual({
      userId: 42,
      openId: "legacy-open-id",
      appId: "app_session_test",
      name: "Sample User",
      sessionVersion: 3,
    });
  });
});
