# P19 后台实时风控面板

本阶段补的是**后台高风险动作的事件化处置闭环**，不是单纯再加一个统计页面。

## 新增能力

- `admin_risk_incidents`：把高危后台动作沉淀成风险事件单
- `/admin/risk`：后台实时风控面板
- `/api/admin/risk/stream`：SSE 实时刷新
- 自动升级：长时间未处理的高危事件会自动提升升级等级并触发升级告警
- 人工动作：确认、升级、关闭

## 风险事件来源

风险事件来自统一后台审计中心。当动作满足以下条件之一时，会自动生成风险事件：

- 被判定为 `critical` 的后台动作
- 被权限拦截的高危动作
- 执行失败的高危动作
- 删除、退款、改权限、改系统配置等敏感动作

## 自动升级

默认规则：

- 首次升级：`ADMIN_RISK_ESCALATE_AFTER_MINUTES`
- 重复升级：`ADMIN_RISK_ESCALATE_REPEAT_MINUTES`

升级后会复用 P18 的告警链路，把升级告警推给：

- 站内消息
- 邮件
- Webhook
- 服务端日志

## 环境变量

```bash
ADMIN_RISK_ESCALATE_AFTER_MINUTES=10
ADMIN_RISK_ESCALATE_REPEAT_MINUTES=30
```

这两个配置也已经接入后台系统配置中心。

## P20：风控处置 SOP 与自动化规则

本版新增：

- 风控处置 SOP（admin_risk_playbooks）
- 风控自动化规则（admin_risk_automation_rules）
- 风控规则执行记录（admin_risk_rule_executions）

规则命中后可自动：

- 给风险事件挂接 SOP
- 自动确认风险事件
- 自动升级并触发已有审计告警链路

后台入口：`/admin/risk`

## P21：风控 SLA 与值班指派中心

本版新增：

- 风控 SLA 规则（`admin_risk_sla_policies`）
- 风控值班指派（`admin_risk_oncall_assignments`）
- 风险事件字段：负责人、确认时限、关闭时限、SLA 状态

后台入口仍然是：`/admin/risk`

新增能力：

- 风险事件创建后，会自动套用一条匹配的 SLA 规则
- 会自动尝试挂给一名值班负责人
- 可在事件上人工认领 / 改派
- 面板会展示：SLA 是否即将超时、是否已超时、是否无人负责

这样风控流程从“看到风险”推进到了“谁负责、多久处理、超时没有”。
