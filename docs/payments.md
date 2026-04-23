# 支付回调、渠道适配与订单稳定性

当前版本已经包含：

- `POST /api/payments/callback` 通用支付回调入口（HMAC-SHA256）
- `POST /api/payments/wechat/notify` 微信支付 API v3 回调入口
- `POST /api/payments/alipay/notify` 支付宝异步通知入口
- `GET /api/payments/session/:token/view` 支付会话查看页（支付宝跳转 / 微信二维码展示）
- 订单幂等（`orders.idempotencyKey`）
- 支付回调幂等（`payment_callbacks` 去重）
- 权益补发与退款后自动回收
- 支付通知中心（日志 / 站长通知 / Webhook）
- `payment_sessions` 支付会话表（P10）

## P10 新增内容

### 1. 统一支付会话

新增 `payment_sessions`：

- 记录每次真实发起支付的 provider / channel
- 记录第三方侧会话号、跳转地址、二维码地址
- 记录本次发起请求和返回结果
- 用于排查“用户说点了支付但后台没回调”的问题

### 2. 微信支付服务端下单

当前实现：

- 服务端调用微信 Native 下单接口
- 返回 `code_url`
- 系统会生成一个站内支付会话页，打开后展示二维码
- 用户扫码后，微信异步通知 `/api/payments/wechat/notify`

需要的环境变量：

- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_CERT_SERIAL_NO`
- `WECHAT_PAY_PRIVATE_KEY`
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_PLATFORM_PUBLIC_KEY`
- `WECHAT_PAY_NOTIFY_URL`

### 3. 支付宝服务端适配

当前实现：

- 服务端生成 `alipay.trade.page.pay` 的签名请求
- 用户会被重定向到支付宝收银台
- 支付宝异步通知 `/api/payments/alipay/notify`

需要的环境变量：

- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`
- `ALIPAY_NOTIFY_URL`
- `ALIPAY_RETURN_URL`

## 新增环境变量

```bash
PAYMENT_RETURN_URL_BASE=http://localhost:3000/pricing
PAYMENT_DEFAULT_PROVIDER=alipay

WECHAT_PAY_BASE_URL=https://api.mch.weixin.qq.com
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_CERT_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_PLATFORM_PUBLIC_KEY=
WECHAT_PAY_NOTIFY_URL=http://localhost:3000/api/payments/wechat/notify

ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_NOTIFY_URL=http://localhost:3000/api/payments/alipay/notify
ALIPAY_RETURN_URL=http://localhost:3000/pricing
```

## 支付链路说明

### 创建订单

前台仍然先调用：

- `commerce.createOrder`

### 发起真实支付

然后调用：

- `commerce.createCheckout`

入参：

```json
{
  "orderId": 1001,
  "provider": "alipay",
  "channel": "page"
}
```

或：

```json
{
  "orderId": 1001,
  "provider": "wechat",
  "channel": "native"
}
```

返回里会带：

- `launchUrl`
- `provider`
- `channel`
- `mode`

前台只要打开 `launchUrl` 即可。

## 回调行为

### 支付成功

- 更新订单为 `paid`
- 写入支付回调日志
- 发放单课或会员权益
- 记录支付通知

### 重复回调

- 不会重复发权益
- 会做权益自检 / 补发检查
- 继续记录回调日志

### 退款回调

- 更新订单为 `refunded`
- 自动回收权益
- 记录“退款成功”和“权益回收”通知

## 当前边界

P10 这版已经有：

- 真实渠道的服务端适配入口
- 微信 Native 下单
- 支付宝网页支付签名生成
- 微信 / 支付宝异步回调桥接到站内订单系统

但还没做：

- 微信平台证书自动拉取与轮换
- 支付宝退款接口主动调用
- 微信退款回调单独解密链路
- 多商户号 / 多应用配置后台化
- 订单轮询和前台支付结果页


## P12：支付消息中心与邮件骨架

新增数据表：

- `user_notifications`：前台站内信
- `email_deliveries`：邮件投递记录

行为说明：

- 当订单进入 `paid / cancelled / refunded`，或发生 `benefits_repaired / benefits_revoked` 时，系统会自动：
  - 继续写入原有支付通知中心
  - 写入前台站内信
  - 生成一条邮件投递记录
- 邮件当前支持两种模式：
  - `log`：只记日志，不实际发送
  - `webhook`：把邮件请求 POST 到你自己的邮件服务

前台页面：

- `/notifications`：查看站内信和邮件投递状态
- `/payment/success`：支付成功页
- `/payment/failed`：支付失败页
- `/payment/refunded`：退款结果页
- `/payment/pending`：等待支付结果页


## P13：邮件服务商与实时通知

- `EMAIL_DELIVERY_MODE` 新增 `resend`
- `RESEND_API_KEY` 配置后，支付类邮件可直接通过 Resend 发送
- 新增 `/api/notifications/stream`，前台消息中心优先走 SSE 实时刷新，失败时自动退回轮询
