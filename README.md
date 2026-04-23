# LearnFlow

一个面向视频教程场景的在线学习平台，基于 React + Express + tRPC + Drizzle + MySQL。

这版已经补上了 P0 + P1 + P2 前置 + 商业化骨架，并继续补了内容分发闭环的第一版：

- 媒体中心：后台可上传图片、视频、文件，并复用到课程和章节
- 课程管理增强：课程封面、主视频支持上传或从媒体库选择
- 章节管理增强：章节可增删改、上下排序、绑定视频、设置试看
- 学习进度：自动保存播放位置、章节完成状态、课程总进度
- 用户中心：`/me` 展示已开始课程、收藏和最近学习记录
- 评论审核：评论支持待审 / 通过 / 拒绝
- 搜索增强：首页支持关键词 + 难度筛选
- 首页运营：新增 `/admin/site`，可配置首屏文案与 Banner
- 课程权限：支持免费 / 登录可看 / 会员 / 单课付费 四种访问类型
- 基础修复：课程列表 total 统计、播放量累计、评论后评分回写

- 对象存储适配：支持 `local / forge / s3` 三种存储驱动
- 直传能力：S3 / R2 / MinIO 可走预签名 PUT 直传，减少大文件 base64 压力
- 媒体分发：新增 `/api/media/:id/content`，统一处理本地/对象存储媒体访问
- 资源保护：视频/文件默认按“受保护媒体”创建，可按课程权限动态放行

## 技术栈

- 前端：React + Vite + TanStack Query + wouter
- 服务端：Express + tRPC
- 数据层：Drizzle ORM + MySQL
- UI：Radix UI + Tailwind

## 本地启动

1. 复制环境变量

```bash
cp .env.example .env
```

2. 填写数据库和登录配置

最少要补：

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`

3. 执行数据库迁移

```bash
pnpm drizzle-kit migrate
```

4. 启动开发环境

```bash
pnpm install
pnpm dev
```

默认会启动在 `http://localhost:3000`，端口被占用时会自动尝试后续端口。

## 媒体上传与分发说明

- `STORAGE_DRIVER=local`：文件落到本地 `uploads/`。
- `STORAGE_DRIVER=forge`：继续走 Manus/Forge 存储代理。
- `STORAGE_DRIVER=s3`：支持 S3 / Cloudflare R2 / MinIO，后台会优先走预签名 PUT 直传。
- 对象存储资源通过 `/api/media/:id/content` 统一分发；公开资源可直接访问，受保护资源会按课程权限校验后再跳转签名地址。
- 视频和文件默认走“受保护”模式，图片默认公开。
- 新增短时播放票据：前台播放器会优先签发 `/api/playback/ticket/...` 链接，再加载实际视频内容。
- 后台媒体中心已支持真正的 `transcode_jobs` 转码任务、任务派发、回调落库，以及模拟完成回调。
- 新增 `POST /api/transcode/callback` 与 `GET /api/transcode/jobs/:jobId/source`：外部转码器既能安全拉取受保护源视频，也能把结果写回数据库。
- 播放器已接入 `hls.js` 动态加载：浏览器不支持原生 HLS 时，会优先尝试 hls.js；失败后再自动回退到直链视频。
- 如果没有配置对象存储，仍会自动回退到 base64 + 本地落盘模式。
- 新上传的受保护本地媒体会写入 `private_uploads/`，不会再直接暴露到公开静态目录。

## 目录说明

```text
client/src/pages/admin/AdminMedia.tsx   后台媒体中心
client/src/pages/admin/AdminCourses.tsx 后台课程 + 章节管理
client/src/pages/MyLearning.tsx         用户学习中心
server/uploads.ts                       媒体上传落盘/云存储封装
server/transcode.ts                     转码任务派发 / 安全拉源 / 回调处理
server/db.ts                            主要业务数据访问层
server/routers.ts                       tRPC 路由
docs/transcode.md                       外部转码 worker 对接说明
```

## 转码对接

想接外部 ffmpeg worker / Cloudflare Worker / 自建队列消费者，可以直接看：

- `docs/transcode.md`

## 建议的下一步

- HLS 分片级鉴权与 manifest 重写
- 转码队列自动重试 / 死信队列
- WebSocket / SSE 推送实时转码进度
- 真实支付回调与订单状态同步
- 订单幂等与权益补单修复
- 首页分区和更细的运营位

## P10 新增

- 真实支付渠道适配层：`commerce.createCheckout`
- `payment_sessions` 支付会话表
- 微信支付 Native 服务端下单与二维码会话页
- 支付宝网页支付签名生成与站内跳转页
- `/api/payments/wechat/notify` 微信异步通知桥接
- `/api/payments/alipay/notify` 支付宝异步通知桥接
- 后台订单页显示支付网关就绪状态

## HLS 受控播放（P7）

当前版本已经支持：

- `manifest.m3u8` 服务端重写
- HLS 分片 / 子清单走受控播放票据路由
- 本地 `private_uploads/`、对象存储和远端 HLS 清单的统一代理访问
- 目录越界和跨源 HLS 资源拦截

说明：

- HLS 播放票据仍然使用短时 `MEDIA_TICKET_TTL_SECONDS` 控制。
- Safari 原生 HLS 和 `hls.js` 都会通过重写后的同源 URL 请求分片。
- 当前实现优先保证权限闭环和可接入性，还没有做分片级 Range 优化和 CDN 边缘签名。


## 支付回调与补单（P8）

当前版本新增：

- `POST /api/payments/callback` 通用支付回调入口
- `payment_callbacks` 回调日志表
- 订单幂等复用：同一用户同一商品的待支付订单会优先复用
- 已支付订单的回调幂等处理：重复通知不会重复发放权益
- 后台订单页支持“补发权益”

详细说明见：

- `docs/payments.md`


## P9 新增

- 退款自动回收权益
- 支付通知中心（日志 / 站长通知 / Webhook）
- 后台订单支持手动退款
- 后台可查看并重试支付通知


## 真实支付渠道（P10）

想接微信支付或支付宝，可直接看：

- `docs/payments.md`

最少要补：

- `WECHAT_PAY_*` 一组变量（微信 Native 支付）
- `ALIPAY_*` 一组变量（支付宝网页支付）
- `PAYMENT_RETURN_URL_BASE`

当前前台的 `/pricing` 和课程详情页已经支持发起真实支付；未配置真实渠道时，会自动保留“模拟支付”作为开发兜底。


## P11 支付结果页与到账轮询

- 新增 `/payment/pending`（并会自动切换到 success / failed / refunded） 前台结果页
- 创建支付后，当前页会自动跳到结果页，支付窗口在新页打开
- 结果页会轮询订单与支付会话状态，支付回调一落库就自动刷新权益
- 支付会话页也会提供返回站内结果页的入口


## P12：支付结果页细分 + 消息中心

- 新增前台支付状态路由：`/payment/pending`、`/payment/success`、`/payment/failed`、`/payment/refunded`
- 新增前台消息中心：`/notifications`
- 新增 `user_notifications`：站内信记录
- 新增 `email_deliveries`：邮件投递记录 / Webhook 骨架
- 支付成功、失败、取消、退款、权益补发、权益回收都会自动写入站内信和邮件投递记录
- Navbar 新增未读消息角标
- 结果页会自动根据订单状态跳转到成功 / 失败 / 退款页

新增环境变量：

- `EMAIL_DELIVERY_MODE=log|webhook`
- `EMAIL_WEBHOOK_URL`
- `EMAIL_WEBHOOK_SECRET`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`


## P13 更新

- 邮件投递新增 `resend` 模式，可直接通过 Resend API 发送交易邮件
- 新增 `/api/notifications/stream` SSE 实时通知流
- 前台 Navbar 与 `/notifications` 页面接入 SSE + 轮询兜底
- 新增环境变量：`RESEND_API_KEY`、`RESEND_API_BASE_URL`


## P14 系统配置中心

新增后台页面 `/admin/system`，可查看并覆盖这几类运行时配置：

- 站点回跳地址
- 对象存储 / 签名地址
- 邮件投递模式与发件人
- 微信 / 支付宝支付网关参数

说明：

- 后台覆盖保存在数据库 `system_settings` 表
- 服务启动时会自动把覆盖项合并到当前运行时配置
- 在后台保存或清除覆盖后，会立即刷新当前进程内的配置对象
- 现有 `AdminSite` 仍负责首页文案和 Banner 运营配置


## P15 配置审计与快照

系统配置中心新增两条关键能力：

- 审计日志：每次手工保存、清除覆盖、导入快照、恢复快照都会写入 `system_setting_audit_logs`
- 配置快照：支持导出当前后台覆盖、导入 JSON 快照、从历史快照一键恢复，快照记录保存在 `system_config_snapshots`

建议操作顺序：

1. 先在 `/admin/system` 导出当前覆盖配置留档
2. 导入外部快照前先做预览校验
3. 生产环境恢复快照时优先用“合并恢复”，确认无误后再做“全量恢复”


## P17 后台操作审计中心

- 新增统一后台审计表 `admin_action_audit_logs`
- 已接入课程/分类/章节/媒体/商品/订单/权限/系统配置等核心后台动作
- 新增后台页面 `/admin/audit` 用于筛选、检索和查看危险操作留痕

## P18 审计告警

- 后台新增：`/admin/audit-alerts`
- 高风险后台动作会自动生成审计告警，并按配置推送到站内消息、邮件和 Webhook。
- 详细说明见 `docs/admin-alerts.md`


## P19

- 后台实时风控面板：`/admin/risk`
- 说明文档：`docs/admin-risk.md`

- P21：后台风控面板已加入 SLA 和值班指派。
