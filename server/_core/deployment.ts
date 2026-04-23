import { getStorageDriver } from "../storage.js";
import { ENV } from "./env.js";

export type DeploymentDiagnostics = {
  runtime: "development" | "node" | "vercel" | "unknown";
  ready: boolean;
  missingCriticalEnv: string[];
  warnings: string[];
  storageDriver: string;
  analyticsConfigured: boolean;
  paymentProvider: string;
  timestamp: string;
};

function hasValue(value: string | undefined | null) {
  return typeof value === "string" && value.trim().length > 0;
}

function missingVars(names: string[]) {
  return names.filter((name) => !hasValue(process.env[name]));
}

export function getDeploymentDiagnostics(runtime: DeploymentDiagnostics["runtime"] = "unknown"): DeploymentDiagnostics {
  const storageDriver = getStorageDriver();
  const missingCriticalEnv = missingVars([
    "JWT_SECRET",
    "DATABASE_URL",
    "VITE_APP_ID",
    "OAUTH_SERVER_URL",
    "OWNER_OPEN_ID",
    "PUBLIC_APP_URL",
  ]);
  const warnings: string[] = [];
  const analyticsConfigured =
    hasValue(process.env.VITE_ANALYTICS_ENDPOINT) &&
    hasValue(process.env.VITE_ANALYTICS_WEBSITE_ID);

  if (
    hasValue(process.env.VITE_ANALYTICS_ENDPOINT) !==
    hasValue(process.env.VITE_ANALYTICS_WEBSITE_ID)
  ) {
    warnings.push(
      "Analytics is only partially configured. Set both VITE_ANALYTICS_ENDPOINT and VITE_ANALYTICS_WEBSITE_ID, or leave both empty."
    );
  }

  if (
    runtime === "vercel" &&
    storageDriver === "local"
  ) {
    warnings.push(
      "Local uploads are not persistent on Vercel. Configure S3 or Forge storage before enabling media uploads in production."
    );
  }

  if (storageDriver === "s3") {
    const missingS3Env = missingVars([
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ]);
    if (missingS3Env.length > 0) {
      warnings.push(`S3 storage is selected but missing: ${missingS3Env.join(", ")}`);
    }
  }

  if (storageDriver === "forge") {
    const missingForgeEnv = missingVars([
      "BUILT_IN_FORGE_API_URL",
      "BUILT_IN_FORGE_API_KEY",
    ]);
    if (missingForgeEnv.length > 0) {
      warnings.push(`Forge storage is selected but missing: ${missingForgeEnv.join(", ")}`);
    }
  }

  if (ENV.paymentDefaultProvider === "wechat") {
    const missingWechatEnv = missingVars([
      "WECHAT_PAY_APP_ID",
      "WECHAT_PAY_MCH_ID",
      "WECHAT_PAY_PRIVATE_KEY",
      "WECHAT_PAY_API_V3_KEY",
      "WECHAT_PAY_NOTIFY_URL",
    ]);
    if (missingWechatEnv.length > 0) {
      warnings.push(`WeChat Pay is the default provider but missing: ${missingWechatEnv.join(", ")}`);
    }
  }

  if (ENV.paymentDefaultProvider === "alipay") {
    const missingAlipayEnv = missingVars([
      "ALIPAY_APP_ID",
      "ALIPAY_PRIVATE_KEY",
      "ALIPAY_PUBLIC_KEY",
      "ALIPAY_NOTIFY_URL",
      "ALIPAY_RETURN_URL",
    ]);
    if (missingAlipayEnv.length > 0) {
      warnings.push(`Alipay is the default provider but missing: ${missingAlipayEnv.join(", ")}`);
    }
  }

  if (ENV.emailDeliveryMode !== "log") {
    const missingEmailEnv = missingVars(["EMAIL_FROM_ADDRESS"]);
    if (missingEmailEnv.length > 0) {
      warnings.push(`Email delivery is enabled but missing: ${missingEmailEnv.join(", ")}`);
    }
  }

  return {
    runtime,
    ready: missingCriticalEnv.length === 0,
    missingCriticalEnv,
    warnings,
    storageDriver,
    analyticsConfigured,
    paymentProvider: ENV.paymentDefaultProvider,
    timestamp: new Date().toISOString(),
  };
}
