# 审计告警（P18）

- 高风险后台操作会自动生成审计告警。
- 默认覆盖：退款、改权限、清配置、导入/恢复快照、删除课程/媒体/商品，以及执行失败/被拦截的后台操作。
- 告警会按配置分发到站内消息、邮件、Webhook。
- 后台页面：`/admin/audit-alerts`。

## 相关环境变量

- `ADMIN_ALERT_INBOX_ENABLED=true`
- `ADMIN_ALERT_EMAIL_ENABLED=true`
- `ADMIN_ALERT_WEBHOOK_URL=`
- `ADMIN_ALERT_WEBHOOK_SECRET=`
