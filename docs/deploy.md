# Deploying LearnFlow

## What is already wired up

- `pnpm check`
- `pnpm test`
- `pnpm build`
- `GET /api/health`
- `GET /api/healthz`
- Vercel entrypoint in `api/index.js`
- Local Vercel project link in `.vercel/project.json`

## Recommended production shape

- Host the frontend and API on Vercel.
- Use a production MySQL database that Vercel can reach.
- Use `S3` storage for uploads and media playback.
- Keep `STORAGE_DRIVER=local` for local development only.

## 1. Install dependencies

```bash
pnpm install
```

## 2. Prepare environment variables

For local development:

```bash
cp .env.example .env
```

For production / Vercel:

- Start from `.env.vercel.example`
- Copy every required value into the Vercel project environment variables
- Do not commit real secrets
- Keep `PUBLIC_APP_URL` aligned with the active production domain before testing OAuth

Minimum required variables:

- `JWT_SECRET`
- `DATABASE_URL`
- `PUBLIC_APP_URL`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`

If you want OTP login in production:

- Email OTP
  - `EMAIL_DELIVERY_MODE=resend`
  - `RESEND_API_KEY`
  - `EMAIL_FROM_ADDRESS`
- SMS OTP via Tencent Cloud
  - `SMS_PROVIDER=tencent`
  - `TENCENT_SMS_SECRET_ID`
  - `TENCENT_SMS_SECRET_KEY`
  - `TENCENT_SMS_REGION`
  - `TENCENT_SMS_SDK_APP_ID`
  - `TENCENT_SMS_SIGN_NAME`
  - `TENCENT_SMS_TEMPLATE_ID_LOGIN`

If you want WeChat login in production:

- `WECHAT_LOGIN_APP_ID`
- `WECHAT_LOGIN_APP_SECRET`
- `WECHAT_LOGIN_REDIRECT_URI`

If `WECHAT_LOGIN_REDIRECT_URI` is omitted, LearnFlow falls back to `PUBLIC_APP_URL + /api/auth/wechat/callback`.
That fallback is convenient for one-domain deployments on Vercel, but the final callback URL still needs to be allow-listed in your WeChat Open Platform application settings.

Recommended for Vercel media support:

- `STORAGE_DRIVER=s3`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` or `S3_ENDPOINT`

Optional but supported:

- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`
- payment provider credentials
- email and admin alert webhooks

You can populate variables through the Vercel CLI:

```bash
pnpm dlx vercel env add PUBLIC_APP_URL production
pnpm dlx vercel env add JWT_SECRET production
pnpm dlx vercel env add DATABASE_URL production
pnpm dlx vercel env add VITE_APP_ID production
pnpm dlx vercel env add OAUTH_SERVER_URL production
pnpm dlx vercel env add OWNER_OPEN_ID production
```

## 3. Validate the production configuration

```bash
pnpm env:check
```

This prints a deployment diagnostics JSON document and exits non-zero if critical environment variables are missing.

## 4. Run database migrations

```bash
pnpm db:push
```

Point `DATABASE_URL` to the production database before running this command.

## 5. Deploy to Vercel

If the machine is already authenticated with Vercel:

```bash
pnpm vercel:pull
pnpm vercel:deploy
```

If the CLI is not authenticated yet, log in first with the Vercel CLI or configure `VERCEL_TOKEN`.

## 6. Smoke-test the deployed site

```bash
pnpm smoke:deploy -- https://your-domain.example.com
```

This checks:

- `/`
- `/pricing`
- `/api/health`

Then manually verify:

- `GET /api/health` returns `200` instead of `503`
- login / logout
- `/login` shows only the methods that are actually configured
- WeChat login redirects to the official QR page when `WECHAT_LOGIN_*` is configured
- after WeChat callback, the site returns to the requested page and shows a logged-in state
- email OTP works when email delivery is configured
- phone OTP works only after Tencent SMS is fully configured
- legacy OAuth reaches the OAuth provider instead of an internal error page
- after OAuth callback or OTP verification, the homepage shows a logged-in state
- one core course page
- one core tRPC data page
- admin course page
- admin order page
- admin risk page
- media upload and playback
- payment sandbox callback, if payments are enabled
- SSE streams at `/api/notifications/stream` and `/api/admin/risk/stream`

## 7. Runtime notes

- On Vercel, local filesystem uploads are not persistent.
- `/api/health` returns deployment diagnostics and reports `503` if critical environment variables are missing.
- `GET /api/oauth/login` returns a readable error page when OAuth is not configured, which usually means `PUBLIC_APP_URL`, `VITE_APP_ID`, or `OAUTH_SERVER_URL` is still missing.
- `GET /api/auth/wechat/login` returns a readable error page when WeChat login is not configured, which usually means `WECHAT_LOGIN_APP_ID`, `WECHAT_LOGIN_APP_SECRET`, or the callback URL is still missing.
- Analytics is injected at runtime only when both analytics environment variables are set.
- The frontend bundle is still large; that is a performance task, not a deployment blocker.
