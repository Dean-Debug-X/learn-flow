# Multi-Login Foundation

## Goal

Introduce a local account model that supports multiple login methods without breaking existing course, order, progress, and admin data linked by `users.id`.

## Data Model

### `users`

Keep `users` as the canonical in-product account table.

New fields added in this phase:
- `avatarUrl`
- `phone`
- `emailVerifiedAt`
- `phoneVerifiedAt`
- `status`
- `sessionVersion`

Legacy fields such as `openId` and `loginMethod` remain in place during migration.

### `user_identities`

Stores every external identity bound to a local user.

Recommended providers for the first rollout:
- `manus_oauth_legacy`
- `wechat_open`
- `wechat_mp`
- `phone_otp`
- `email_otp`

Important constraints:
- unique by `provider + providerUserId`
- indexed by `userId + provider`
- indexed by `providerUnionId` for future WeChat account merging

### `auth_otps`

Stores one-time password challenges for phone and email login.

Supported channels:
- `sms`
- `email`

Typical purposes:
- `login`
- `bind`
- `change_phone`
- `change_email`

### `auth_audit_logs`

Stores authentication-related audit events such as:
- OTP sent
- OTP verified
- login succeeded
- login failed
- identity bound
- identity unbound

## Rollout Plan

### Phase 1

Database-only foundation:
- add new columns to `users`
- create `user_identities`
- create `auth_otps`
- create `auth_audit_logs`
- backfill existing `users.openId` rows into `user_identities` as `manus_oauth_legacy`

### Phase 2

Session migration:
- change session payload to use `userId + sessionVersion`
- keep compatibility with legacy `openId` session for one transition window
- continue embedding `openId` in new cookies as a bridge until legacy owner and sync flows are fully retired

### Phase 3

Add login methods:
- phone OTP login
- email OTP login
- WeChat login

### Phase 4

Add account security UI:
- list bound identities
- bind phone
- bind email
- bind WeChat
- unbind identity with guardrails

## API Shape

### Existing APIs to keep
- `auth.me`
- `auth.logout`

### New session APIs
- `auth.identities`
- `auth.availableMethods`

These two are safe read-only foundation endpoints and can be shipped before phone, email, or WeChat login is fully implemented.

### Phone login APIs
- `auth.phone.sendCode`
- `auth.phone.verifyCode`

### Email login APIs
- `auth.email.sendCode`
- `auth.email.verifyCode`

### WeChat login routes
- `GET /api/auth/wechat/login`
- `GET /api/auth/wechat/callback`

### Binding APIs
- `auth.bind.phone.sendCode`
- `auth.bind.phone.confirm`
- `auth.bind.email.sendCode`
- `auth.bind.email.confirm`
- `GET /api/auth/wechat/bind`
- `GET /api/auth/wechat/bind/callback`
- `auth.unbindIdentity`

## Operational Notes

- `OWNER_OPEN_ID` should eventually move to `OWNER_USER_ID`.
- `sessionVersion` should be incremented on high-risk actions such as identity removal, forced logout, and account disablement.
- SMS and email OTPs need rate limiting, target normalization, and hashed code storage before production use.
- During the transition window, new users created outside legacy OAuth may need an internal synthetic `openId` until the old `users.openId` dependency is fully removed.

## Implemented In This Iteration

### Backend

Already implemented:
- `auth.availableMethods`
- `auth.identities`
- `auth.phone.sendCode`
- `auth.phone.verifyCode`
- `auth.email.sendCode`
- `auth.email.verifyCode`
- `GET /api/auth/wechat/login`
- `GET /api/auth/wechat/callback`

Current behavior:
- phone OTP supports `SMS_PROVIDER=log` for development
- email OTP reuses the existing email delivery layer
- WeChat login uses a signed `state` value and redirects through the official QR login flow
- successful WeChat callback resolves or creates a local user, upserts `user_identities`, and issues a local session cookie
- OTP verification issues a local session cookie based on `userId + sessionVersion`
- legacy OAuth cookies remain readable during the migration window

### Frontend

Already implemented:
- `/login` page
- login CTA now routes to `/login` instead of directly jumping to `/api/oauth/login`
- phone, email, and legacy OAuth entry points are rendered from `auth.availableMethods`
- WeChat login is rendered only when the required `WECHAT_LOGIN_*` configuration is present

## Environment Notes

### Development

Recommended local setup:
- `SMS_PROVIDER=log`
- `EMAIL_DELIVERY_MODE=log`

This allows phone and email OTP flows to be exercised without a real third-party provider.

### Production

Email OTP can already work with:
- `EMAIL_DELIVERY_MODE=resend`
- `RESEND_API_KEY`
- `EMAIL_FROM_ADDRESS`

Phone OTP now supports Tencent Cloud SMS in production when these variables are configured:
- `SMS_PROVIDER=tencent`
- `TENCENT_SMS_SECRET_ID`
- `TENCENT_SMS_SECRET_KEY`
- `TENCENT_SMS_REGION`
- `TENCENT_SMS_SDK_APP_ID`
- `TENCENT_SMS_SIGN_NAME`
- `TENCENT_SMS_TEMPLATE_ID_LOGIN`

The current implementation sends template parameters in this order:
- `{1}` verification code
- `{2}` valid minutes

WeChat login is available in production when these variables are configured:
- `WECHAT_LOGIN_APP_ID`
- `WECHAT_LOGIN_APP_SECRET`
- `WECHAT_LOGIN_REDIRECT_URI` or `PUBLIC_APP_URL`

Current WeChat rollout notes:
- the login route uses the website QR login entrypoint at `https://open.weixin.qq.com/connect/qrconnect`
- `state` is signed locally to preserve the post-login redirect target
- first-time WeChat users receive a synthetic internal `openId` bridge until the remaining legacy `users.openId` dependencies are fully removed
