import type { Request, Response } from "express";
import { ENV } from "./env.js";

export function prefersHtml(req: Request) {
  const accept = req.header("accept") || "";
  return accept.includes("text/html") || accept.includes("*/*");
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderAuthErrorHtml(
  title: string,
  message: string,
  actionHref = "/",
  actionLabel = "Back to Home"
) {
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
        <a class="secondary" href="/">Back to Home</a>
      </div>
    </main>
  </body>
</html>`;
}

export function sendAuthError(
  req: Request,
  res: Response,
  status: number,
  title: string,
  message: string,
  actionHref = "/",
  actionLabel = "Back to Home"
) {
  if (!prefersHtml(req)) {
    res.status(status).json({ error: title, message });
    return;
  }

  res
    .status(status)
    .type("html")
    .send(renderAuthErrorHtml(title, message, actionHref, actionLabel));
}

export function maskIdentifier(value: string) {
  if (value.length <= 4) return `${value[0] ?? "*"}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function buildAbsoluteUrl(req: Request, pathname: string) {
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

export function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function normalizeRelativeRedirectTarget(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
