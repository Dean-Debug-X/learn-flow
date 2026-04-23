import { useState } from "react";
import { BellRing, Loader2, RefreshCw, SendHorizonal, ShieldAlert, Siren, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusLabels: Record<string, string> = {
  pending: "待发送",
  sent: "已发送",
  failed: "发送失败",
  skipped: "已跳过",
};

const channelLabels: Record<string, string> = {
  log: "服务端日志",
  inbox: "站内消息",
  email: "邮件",
  webhook: "Webhook",
};

const severityLabels: Record<string, string> = {
  warn: "警告",
  critical: "高危",
};

export default function AdminAuditAlerts() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"all" | "pending" | "sent" | "failed" | "skipped">("all");
  const [channel, setChannel] = useState<"all" | "log" | "inbox" | "email" | "webhook">("all");
  const [severity, setSeverity] = useState<"all" | "warn" | "critical">("all");

  const overview = trpc.adminAlerts.overview.useQuery();
  const alertsQuery = trpc.adminAlerts.list.useQuery({ status, channel, severity, limit: 120 });
  const retryMutation = trpc.adminAlerts.retry.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.adminAlerts.list.invalidate(),
        utils.adminAlerts.overview.invalidate(),
        utils.notification.inbox.invalidate(),
        utils.notification.unreadCount.invalidate(),
        utils.notification.emails.invalidate(),
      ]);
      toast.success("已重新投递审计告警");
    },
    onError: (error) => toast.error(`重试失败：${error.message}`),
  });

  const alerts = alertsQuery.data ?? [];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">审计告警中心</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              高风险后台动作会自动生成告警，并分发到站内消息、邮件和 Webhook。这里可以查看发送状态，并对失败或待发送的告警执行重试。
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-[320px]">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">总告警</p>
              <p className="text-xl font-semibold text-foreground mt-1">{overview.data?.total ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">24h 新增</p>
              <p className="text-xl font-semibold text-foreground mt-1">{overview.data?.last24h ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">待处理 / 失败</p>
              <p className="text-xl font-semibold text-foreground mt-1">{(overview.data?.pending ?? 0) + (overview.data?.failures ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">高危告警</p>
              <p className="text-xl font-semibold text-foreground mt-1">{overview.data?.critical ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待发送</SelectItem>
              <SelectItem value="sent">已发送</SelectItem>
              <SelectItem value="failed">发送失败</SelectItem>
              <SelectItem value="skipped">已跳过</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={(value) => setChannel(value as typeof channel)}>
            <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部渠道</SelectItem>
              <SelectItem value="log">服务端日志</SelectItem>
              <SelectItem value="inbox">站内消息</SelectItem>
              <SelectItem value="email">邮件</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(value) => setSeverity(value as typeof severity)}>
            <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部级别</SelectItem>
              <SelectItem value="warn">警告</SelectItem>
              <SelectItem value="critical">高危</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1.15fr_0.7fr_0.65fr_1fr_140px] gap-3 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground">
            <div>告警内容</div>
            <div>级别 / 渠道</div>
            <div>状态</div>
            <div>关联信息</div>
            <div className="text-right">操作</div>
          </div>
          {alertsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          ) : alerts.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">当前筛选条件下没有审计告警记录。</div>
          ) : (
            alerts.map((item) => {
              const isPending = item.status === "pending" || item.status === "failed";
              return (
                <div key={item.id} className="grid grid-cols-[1.15fr_0.7fr_0.65fr_1fr_140px] gap-3 px-4 py-4 border-b border-border last:border-0 items-start text-sm">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      {item.severity === "critical" ? <Siren className="w-4 h-4 shrink-0 text-rose-500" /> : <BellRing className="w-4 h-4 shrink-0 text-amber-500" />}
                      <span className="line-clamp-1">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed line-clamp-5">{item.content}</p>
                    {item.lastError ? (
                      <div className="inline-flex items-start gap-1.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 px-2.5 py-1 text-[11px]">
                        <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{item.lastError}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className={item.severity === "critical" ? "text-rose-600 dark:text-rose-400 font-medium" : "text-amber-600 dark:text-amber-400 font-medium"}>{severityLabels[item.severity] ?? item.severity}</p>
                    <p>{channelLabels[item.channel] ?? item.channel}</p>
                    <p className="line-clamp-1">{item.recipient || item.targetUser?.email || item.targetUser?.name || "—"}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "sent" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : item.status === "failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" : item.status === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" : "bg-secondary text-muted-foreground"}`}>
                      {statusLabels[item.status] ?? item.status}
                    </span>
                    <p className="text-xs text-muted-foreground mt-2">尝试 {item.attempts} 次</p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>动作：{item.audit?.actionLabel ?? item.actionType}</p>
                    <p>结果：{item.audit?.actionStatus === "blocked" ? "被拦截" : item.audit?.actionStatus === "failed" ? "失败" : "成功"}</p>
                    <p>资源：{item.audit?.resourceLabel || item.audit?.resourceId || item.audit?.resourceType || "未关联"}</p>
                    <p>创建：{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                    <p>最后尝试：{item.lastAttemptAt ? new Date(item.lastAttemptAt).toLocaleString("zh-CN") : "无"}</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {item.actionUrl ? (
                      <a href={item.actionUrl} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">查看落点</a>
                    ) : null}
                    {isPending ? (
                      <Button size="sm" variant="outline" onClick={() => retryMutation.mutate({ alertId: item.id })} disabled={retryMutation.isPending} className="gap-1.5">
                        {retryMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
                        重试
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <RefreshCw className="w-3.5 h-3.5" />
                        已完成
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-xs text-muted-foreground inline-flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>默认会对退款、改权限、清配置、导入/恢复快照、删除课程/媒体/商品等动作触发告警；执行失败或被权限拦截的后台操作也会触发。</span>
        </div>
      </div>
    </AdminLayout>
  );
}
