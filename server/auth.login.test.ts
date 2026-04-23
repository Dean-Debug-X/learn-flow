import { describe, expect, it } from "vitest";
import { getSmsProviderMode, isSmsDeliveryReady } from "./_core/env.js";
import {
  AuthLoginError,
  buildLocalOpenId,
  normalizeEmailAddress,
  normalizePhoneNumber,
} from "./authLogin.js";

describe("auth login helpers", () => {
  it("normalizes email addresses to lowercase and trimmed form", () => {
    expect(normalizeEmailAddress("  Admin@Example.COM ")).toBe(
      "admin@example.com"
    );
  });

  it("normalizes mainland china mobile numbers to +86 format", () => {
    expect(normalizePhoneNumber("138 0013 8000")).toBe("+8613800138000");
    expect(normalizePhoneNumber("8613800138000")).toBe("+8613800138000");
  });

  it("rejects invalid phone numbers", () => {
    expect(() => normalizePhoneNumber("12345")).toThrow(AuthLoginError);
  });

  it("builds deterministic local open ids within the legacy column limit", () => {
    const first = buildLocalOpenId("email_otp", "admin@example.com");
    const second = buildLocalOpenId("email_otp", "admin@example.com");

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(first.startsWith("local_")).toBe(true);
  });

  it("recognizes the tencent sms provider mode", () => {
    expect(getSmsProviderMode({ smsProvider: "tencent" } as any)).toBe(
      "tencent"
    );
    expect(getSmsProviderMode({ smsProvider: "LOG" } as any)).toBe("log");
    expect(getSmsProviderMode({ smsProvider: "" } as any)).toBe("disabled");
  });

  it("marks tencent sms delivery ready only when all required config exists", () => {
    expect(
      isSmsDeliveryReady({
        smsProvider: "tencent",
        tencentSmsSecretId: "sid",
        tencentSmsSecretKey: "skey",
        tencentSmsRegion: "ap-guangzhou",
        tencentSmsSdkAppId: "1400000000",
        tencentSmsSignName: "LearnFlow",
        tencentSmsTemplateIdLogin: "123456",
      } as any)
    ).toBe(true);

    expect(
      isSmsDeliveryReady({
        smsProvider: "tencent",
        tencentSmsSecretId: "sid",
        tencentSmsSecretKey: "skey",
        tencentSmsRegion: "ap-guangzhou",
        tencentSmsSdkAppId: "1400000000",
        tencentSmsSignName: "LearnFlow",
        tencentSmsTemplateIdLogin: "",
      } as any)
    ).toBe(false);
  });
});
