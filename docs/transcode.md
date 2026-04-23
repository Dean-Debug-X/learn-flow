# 转码任务与回调说明

这版新增了真正可接外部 worker 的转码骨架，核心包括：

- `transcode_jobs`：记录转码任务排队、派发、处理中、完成、失败状态
- `POST /api/transcode/callback`：接收外部转码器回调并写回数据库
- `GET /api/transcode/jobs/:jobId/source?token=...`：给外部转码器安全拉取受保护源视频
- 后台媒体中心：支持创建任务、派发任务、重置重试、模拟完成回调

## 必填环境变量

```bash
PUBLIC_APP_URL=http://localhost:3000
TRANSCODE_PROVIDER=manual
TRANSCODE_WEBHOOK_URL=
TRANSCODE_CALLBACK_SECRET=replace-me
TRANSCODE_SOURCE_TTL_SECONDS=3600
```

- `PUBLIC_APP_URL`：外部 worker 访问本站回调和拉源时使用
- `TRANSCODE_WEBHOOK_URL`：配置后，后台“派发任务”会自动 POST 到这个地址
- `TRANSCODE_CALLBACK_SECRET`：外部 worker 回调时需要带上

## 自动派发给外部 worker 的载荷

当你在后台点击“派发任务”时，服务端会向 `TRANSCODE_WEBHOOK_URL` 发送一份 JSON：

```json
{
  "jobId": 12,
  "mediaId": 34,
  "profile": "adaptive-720p",
  "output": {
    "prefix": "transcoded/media-34/12"
  },
  "input": {
    "sourceUrl": "https://your-app.example.com/api/transcode/jobs/12/source?token=...",
    "assetId": 34,
    "fileName": "lesson-1.mp4",
    "mimeType": null
  },
  "callback": {
    "url": "https://your-app.example.com/api/transcode/callback",
    "token": "<job callback token>",
    "secret": "<TRANSCODE_CALLBACK_SECRET>"
  },
  "warnings": []
}
```

## 外部 worker 回调示例

### 处理中

```bash
curl -X POST "$PUBLIC_APP_URL/api/transcode/callback" \
  -H "Content-Type: application/json" \
  -H "x-transcode-callback-token: <callback-token>" \
  -H "x-transcode-callback-secret: $TRANSCODE_CALLBACK_SECRET" \
  -d '{
    "jobId": 12,
    "status": "processing",
    "progress": 35,
    "externalJobId": "ffmpeg-12"
  }'
```

### 完成

```bash
curl -X POST "$PUBLIC_APP_URL/api/transcode/callback" \
  -H "Content-Type: application/json" \
  -H "x-transcode-callback-token: <callback-token>" \
  -H "x-transcode-callback-secret: $TRANSCODE_CALLBACK_SECRET" \
  -d '{
    "jobId": 12,
    "status": "ready",
    "progress": 100,
    "externalJobId": "ffmpeg-12",
    "posterUrl": "https://cdn.example.com/transcoded/34/poster.jpg",
    "hlsManifestUrl": "https://cdn.example.com/transcoded/34/master.m3u8"
  }'
```

### 失败

```bash
curl -X POST "$PUBLIC_APP_URL/api/transcode/callback" \
  -H "Content-Type: application/json" \
  -H "x-transcode-callback-token: <callback-token>" \
  -H "x-transcode-callback-secret: $TRANSCODE_CALLBACK_SECRET" \
  -d '{
    "jobId": 12,
    "status": "failed",
    "progress": 12,
    "errorMessage": "ffmpeg exited with code 1"
  }'
```

## 当前边界

这版已经够你接：

- 自己写的 ffmpeg worker
- Node/Python 队列消费者
- 第三方转码服务的 webhook 封装层

但还没做：

- HLS 分片级鉴权
- HLS manifest 内容重写
- 分片上传 / 断点续传
- 自动重试策略 / 死信队列
- 实时进度推送（WebSocket / SSE）


## P7：Manifest 重写与分片鉴权

当媒体 `transcodeStatus=ready` 且存在 HLS Manifest 后，播放链路改为：

1. 前端通过 `playback.createTicket` 获取短时播放票据。
2. `/api/playback/ticket/:token/manifest.m3u8` 读取原始 manifest。
3. 服务端把其中的子清单、分片、`#EXT-X-KEY` / `#EXT-X-MAP` 的 `URI` 重写为同源受控 URL。
4. `/api/playback/ticket/:token/hls/resource?ref=...` 校验票据并代理具体资源。

当前安全限制：

- HLS 资源必须落在根 manifest 同目录树下。
- 远端 HLS 资源必须与根 manifest 同源。
- 目录穿越（`../`）会被拒绝。

这一步解决的是：播放器拿到 HLS 后，后续分片请求不会绕过站点权限控制。
