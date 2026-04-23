import { useMemo, useState } from "react";
import { AlertCircle, Ban, ClipboardList, Filter, RefreshCw, ShieldCheck } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

function statusTone(status?: string | null) {
  if (status === "success") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (status === "blocked") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

export default function AdminAuditCenter() {
  const [actionType, setActionType] = useState("all");
  const [resourceType, setResourceType] = useState("all");
  const [actorUserId, setActorUserId] = useState("");
  const [actionStatus, setActionStatus] = useState<"all" | "success" | "failed" | "blocked">("all");

  const filters = useMemo(() => ({
    limit: 120,
    actionType: actionType === "all" ? undefined : actionType,
    resourceType: resourceType === "all" ? undefined : resourceType,
    actorUserId: actorUserId.trim() ? Number(actorUserId) : undefined,
    actionStatus,
  }), [actionType, resourceType, actorUserId, actionStatus]);

  const overview = trpc.adminAudit.overview.useQuery();
  const logsQuery = trpc.adminAudit.list.useQuery(filters);

  const actionTypes = useMemo(() => {
    const set = new Set<string>();
    for (const row of (logsQuery.data as any[]) ?? []) if (row?.actionType) set.add(row.actionType);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [logsQuery.data]);

  const resourceTypes = useMemo(() => {
    const set = new Set<string>();
    for (const row of (logsQuery.data as any[]) ?? []) if (row?.resourceType) set.add(row.resourceType);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [logsQuery.data]);

  const refreshAll = () => {
    overview.refetch();
    logsQuery.refetch();
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">后台操作审计中心</h1>
          <p className="text-sm text-muted-foreground mt-1">统一查看后台关键动作的留痕，包括删课程、退款、改权限、系统配置变更等。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="w-4 h-4" /> 总记录</div>
            <p className="text-2xl font-semibold">{(overview.data as any)?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">累计留痕</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><RefreshCw className="w-4 h-4" /> 24 小时</div>
            <p className="text-2xl font-semibold">{(overview.data as any)?.last24h ?? 0}</p>
            <p className="text-xs text-muted-foreground">最近 24 小时写入</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="w-4 h-4" /> 7 天</div>
            <p className="text-2xl font-semibold">{(overview.data as any)?.last7d ?? 0}</p>
            <p className="text-xs text-muted-foreground">最近 7 天写入</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><Ban className="w-4 h-4" /> 被拦截</div>
            <p className="text-2xl font-semibold text-amber-700">{(overview.data as any)?.blocked ?? 0}</p>
            <p className="text-xs text-muted-foreground">权限不足 / 拒绝执行</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-rose-700"><AlertCircle className="w-4 h-4" /> 失败</div>
            <p className="text-2xl font-semibold text-rose-700">{(overview.data as any)?.failures ?? 0}</p>
            <p className="text-xs text-muted-foreground">执行报错</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-foreground">筛选条件</h2>
              <p className="text-xs text-muted-foreground mt-1">支持按动作、资源、执行人和结果筛选。</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">动作类型</label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger><SelectValue placeholder="全部动作" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部动作</SelectItem>
                  {actionTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">资源类型</label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger><SelectValue placeholder="全部资源" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部资源</SelectItem>
                  {resourceTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">执行人用户 ID</label>
              <Input value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="例如 1" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">结果</label>
              <Select value={actionStatus} onValueChange={(value: any) => setActionStatus(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="blocked">被拦截</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="w-4 h-4" /> 审计时间线
          </div>
          <div className="divide-y divide-border">
            {(logsQuery.data as any[])?.map((log) => (
              <div key={log.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{log.actionLabel || log.actionType}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(log.actionStatus)}`}>{log.actionStatus === "success" ? "成功" : log.actionStatus === "blocked" ? "已拦截" : "失败"}</span>
                      {log.resourceType ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{log.resourceType}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground break-all">{log.actionType}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">执行人</div>
                    <div className="text-foreground">{log.actorUser?.name || log.actorUser?.email || log.actorUser?.openId || (log.actorUserId ? `用户 #${log.actorUserId}` : "系统")}</div>
                    <div className="text-xs text-muted-foreground">{log.actorRole || "-"}{log.actorAdminLevel ? ` · ${log.actorAdminLevel}` : ""}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">资源</div>
                    <div className="text-foreground break-all">{log.resourceLabel || (log.resourceId ? `#${log.resourceId}` : "-")}</div>
                    <div className="text-xs text-muted-foreground">resourceId: {log.resourceId || "-"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">关联</div>
                    <div className="text-foreground">{log.relatedOrderId ? `订单 #${log.relatedOrderId}` : log.snapshotId ? `快照 #${log.snapshotId}` : log.targetUser ? `目标用户：${log.targetUser.name || log.targetUser.email || log.targetUser.openId}` : "-"}</div>
                    <div className="text-xs text-muted-foreground break-all">IP：{log.ipAddress || "-"}</div>
                  </div>
                </div>
                {log.metadata ? (
                  <details className="rounded-xl bg-secondary/50 p-3 text-xs text-foreground whitespace-pre-wrap break-all">
                    <summary className="cursor-pointer font-medium">查看元数据</summary>
                    <pre className="mt-3 overflow-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ))}
            {!logsQuery.isLoading && !((logsQuery.data as any[])?.length) ? (
              <div className="p-8 text-sm text-muted-foreground text-center">当前筛选条件下没有审计记录。</div>
            ) : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
