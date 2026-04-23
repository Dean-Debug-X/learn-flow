import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Siren, TimerReset, Waves, Bot, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

const severityTone: Record<string, string> = {
  critical: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
  warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
};

const statusTone: Record<string, string> = {
  open: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
  acknowledged: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
};

export default function AdminRiskPanel() {
  const utils = trpc.useUtils();
  const [liveConnected, setLiveConnected] = useState(false);
  const [status, setStatus] = useState<"all" | "open" | "acknowledged" | "resolved">("all");
  const [severity, setSeverity] = useState<"all" | "warn" | "critical">("all");
  const [escalation, setEscalation] = useState<"all" | "none" | "escalated">("all");

  const overview = trpc.adminRisk.overview.useQuery(undefined, { refetchInterval: 30000, refetchOnWindowFocus: true });
  const listQuery = trpc.adminRisk.list.useQuery({ status, severity, escalation, limit: 120 }, { refetchInterval: 30000, refetchOnWindowFocus: true });
  const playbooksQuery = trpc.adminRisk.playbooks.useQuery();
  const rulesQuery = trpc.adminRisk.rules.useQuery();
  const executionsQuery = trpc.adminRisk.executions.useQuery();
  const slaPoliciesQuery = trpc.adminRisk.slaPolicies.useQuery();
  const oncallAssignmentsQuery = trpc.adminRisk.oncallAssignments.useQuery();
  const oncallCandidatesQuery = trpc.adminRisk.oncallCandidates.useQuery();

  const refreshAll = async () => {
    await Promise.all([
      utils.adminRisk.overview.invalidate(),
      utils.adminRisk.list.invalidate(),
      utils.adminRisk.playbooks.invalidate(),
      utils.adminRisk.rules.invalidate(),
      utils.adminRisk.executions.invalidate(),
      utils.adminRisk.slaPolicies.invalidate(),
      utils.adminRisk.oncallAssignments.invalidate(),
      utils.adminRisk.oncallCandidates.invalidate(),
    ]);
  };

  const ackMutation = trpc.adminRisk.acknowledge.useMutation({
    onSuccess: async () => {
      await refreshAll();
      toast.success("已确认风险事件");
    },
    onError: (error) => toast.error(`确认失败：${error.message}`),
  });
  const resolveMutation = trpc.adminRisk.resolve.useMutation({
    onSuccess: async () => {
      await refreshAll();
      toast.success("已关闭风险事件");
    },
    onError: (error) => toast.error(`关闭失败：${error.message}`),
  });
  const escalateMutation = trpc.adminRisk.escalate.useMutation({
    onSuccess: async () => {
      await refreshAll();
      toast.success("已升级风险事件并推送升级告警");
    },
    onError: (error) => toast.error(`升级失败：${error.message}`),
  });
  const runAutomationMutation = trpc.adminRisk.runAutomation.useMutation({
    onSuccess: async (result) => {
      await refreshAll();
      toast.success(`自动化执行完成，命中 ${result.length} 条规则`);
    },
    onError: (error) => toast.error(`执行失败：${error.message}`),
  });
  const upsertPlaybookMutation = trpc.adminRisk.upsertPlaybook.useMutation({ onSuccess: refreshAll });
  const upsertRuleMutation = trpc.adminRisk.upsertRule.useMutation({ onSuccess: refreshAll });
  const upsertSlaMutation = trpc.adminRisk.upsertSlaPolicy.useMutation({ onSuccess: refreshAll });
  const upsertOncallMutation = trpc.adminRisk.upsertOncallAssignment.useMutation({ onSuccess: refreshAll });
  const assignOwnerMutation = trpc.adminRisk.assignOwner.useMutation({ onSuccess: refreshAll });
  const claimMutation = trpc.adminRisk.claim.useMutation({ onSuccess: refreshAll });

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const stream = new EventSource("/api/admin/risk/stream", { withCredentials: true });
    stream.addEventListener("ready", () => setLiveConnected(true));
    stream.addEventListener("snapshot", () => {
      setLiveConnected(true);
      utils.adminRisk.overview.invalidate();
      utils.adminRisk.list.invalidate();
    });
    stream.onerror = () => {
      setLiveConnected(false);
      stream.close();
    };
    return () => {
      setLiveConnected(false);
      stream.close();
    };
  }, [utils]);

  const items = listQuery.data ?? [];
  const busy = ackMutation.isPending || resolveMutation.isPending || escalateMutation.isPending || runAutomationMutation.isPending || upsertSlaMutation.isPending || upsertOncallMutation.isPending || assignOwnerMutation.isPending || claimMutation.isPending;
  const criticalOpenCount = useMemo(() => items.filter((item) => item.status === "open" && item.severity === "critical").length, [items]);

  const handleActionWithNote = (kind: "ack" | "resolve" | "escalate", incidentId: number) => {
    const note = window.prompt(kind === "ack" ? "给这条风险事件留一条处理备注：" : kind === "resolve" ? "填写关闭原因：" : "填写升级原因：", "");
    if (note === null) return;
    if (kind === "ack") ackMutation.mutate({ incidentId, note });
    if (kind === "resolve") resolveMutation.mutate({ incidentId, note });
    if (kind === "escalate") escalateMutation.mutate({ incidentId, note });
  };

  const handleQuickCreatePlaybook = () => {
    const name = window.prompt("SOP 名称", "高危动作处置 SOP");
    if (!name) return;
    const code = window.prompt("SOP 代码（英文/短横线）", name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "risk-playbook");
    if (!code) return;
    const checklist = window.prompt(
      "请输入处置清单（可多行）",
      ["1. 核对操作者", "2. 评估影响", "3. 执行恢复", "4. 记录结论"].join("\n")
    );
    upsertPlaybookMutation.mutate({ code, name, triggerSeverity: "all", summary: `${name} 自动创建`, checklist: checklist || "", enabled: true });
  };

  const handleQuickCreateRule = () => {
    const name = window.prompt("规则名称", "高危事件自动挂 SOP");
    if (!name) return;
    const playbookIdRaw = window.prompt("关联 SOP ID（可留空）", playbooksQuery.data?.[0]?.id ? String(playbooksQuery.data[0].id) : "");
    upsertRuleMutation.mutate({ name, triggerSeverity: "critical", minRiskScore: 80, playbookId: playbookIdRaw ? Number(playbookIdRaw) : null, autoAcknowledge: false, autoEscalate: true, executionNote: "后台快速创建的自动化规则", enabled: true });
  };

  const handleQuickCreateSla = () => {
    const name = window.prompt("SLA 名称", "高危事件 SLA");
    if (!name) return;
    const ack = Number(window.prompt("首次确认时限（分钟）", "10") || 10);
    const resolve = Number(window.prompt("关闭时限（分钟）", "90") || 90);
    upsertSlaMutation.mutate({ name, triggerSeverity: "critical", acknowledgeMinutes: ack, resolveMinutes: resolve, enabled: true });
  };

  const handleQuickCreateOncall = () => {
    const candidates = oncallCandidatesQuery.data ?? [];
    const hint = candidates
      .slice(0, 8)
      .map((item) => `#${item.id} ${item.name || item.email || item.openId}`)
      .join("\n");
    const userIdRaw = window.prompt(`填写值班人用户 ID：
${hint}`, candidates[0]?.id ? String(candidates[0].id) : "");
    if (!userIdRaw) return;
    const userId = Number(userIdRaw);
    const candidate = candidates.find((item) => item.id === userId);
    const name = window.prompt("值班规则名称", candidate ? `${candidate.name || candidate.email || candidate.openId} 值班` : "风控值班");
    if (!name) return;
    upsertOncallMutation.mutate({ name, userId, triggerSeverity: "all", isPrimary: true, enabled: true });
  };

  const handleAssignOwner = (incidentId: number) => {
    const candidates = oncallCandidatesQuery.data ?? [];
    const hint = candidates
      .slice(0, 8)
      .map((item) => `#${item.id} ${item.name || item.email || item.openId}`)
      .join("\n");
    const userIdRaw = window.prompt(`填写负责人用户 ID：
${hint}`, candidates[0]?.id ? String(candidates[0].id) : "");
    if (!userIdRaw) return;
    const note = window.prompt("填写指派备注：", "") || undefined;
    assignOwnerMutation.mutate({ incidentId, ownerUserId: Number(userIdRaw), note });
  };


  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">后台实时风控面板</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              高危后台动作会沉淀成风险事件单。这里可以实时看未处理事件、升级中的高危动作，并对事件执行确认、升级和关闭。
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 min-w-[240px]">
            <p className="text-xs text-muted-foreground">实时状态</p>
            <p className="text-lg font-semibold text-foreground mt-1">{liveConnected ? "SSE 实时连接中" : "轮询兜底中"}</p>
            <p className="text-xs text-muted-foreground mt-2">当前筛选结果中的高危未处理</p>
            <p className="text-xl font-semibold text-rose-600 mt-1">{criticalOpenCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">未处理</p><p className="text-2xl font-semibold mt-2">{overview.data?.open ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">已确认待跟进</p><p className="text-2xl font-semibold mt-2">{overview.data?.acknowledged ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">高危未处理</p><p className="text-2xl font-semibold mt-2 text-rose-600">{overview.data?.criticalOpen ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">已升级</p><p className="text-2xl font-semibold mt-2 text-amber-600">{overview.data?.escalated ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">24h 新增</p><p className="text-2xl font-semibold mt-2">{overview.data?.last24h ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">SLA 已超时</p><p className="text-2xl font-semibold mt-2 text-rose-600">{overview.data?.breached ?? 0}</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">无人负责</p><p className="text-2xl font-semibold mt-2 text-amber-600">{overview.data?.unassigned ?? 0}</p></div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-foreground">筛选与实时刷新</h2>
              <p className="text-xs text-muted-foreground mt-1">支持按状态、级别和升级情况筛选。页面会通过 SSE 自动刷新，断开时回退到轮询。</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="open">未处理</SelectItem>
                <SelectItem value="acknowledged">已确认</SelectItem>
                <SelectItem value="resolved">已关闭</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={(value) => setSeverity(value as typeof severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="critical">高危</SelectItem>
                <SelectItem value="warn">警告</SelectItem>
              </SelectContent>
            </Select>
            <Select value={escalation} onValueChange={(value) => setEscalation(value as typeof escalation)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部升级状态</SelectItem>
                <SelectItem value="escalated">仅已升级</SelectItem>
                <SelectItem value="none">仅未升级</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.72fr_0.75fr_0.9fr_180px] gap-3 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground">
            <div>风险事件</div>
            <div>级别 / 分数</div>
            <div>状态 / 升级</div>
            <div>执行人与时间</div>
            <div className="text-right">操作</div>
          </div>
          {listQuery.isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">加载中...</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">当前筛选条件下没有风险事件。</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1.2fr_0.72fr_0.75fr_0.9fr_180px] gap-3 px-4 py-4 border-b border-border last:border-0 items-start text-sm">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    {item.severity === "critical" ? <Siren className="w-4 h-4 text-rose-500 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />}
                    <span className="line-clamp-1">{item.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4 leading-relaxed">{item.summary || item.audit?.actionLabel || item.audit?.actionType}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {item.slaStatus ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">SLA：{item.slaStatus === "breached" ? "已超时" : item.slaStatus === "due_soon" ? "即将超时" : item.slaStatus === "resolved" ? "已完成" : "进行中"}</span> : null}
                    {item.audit?.resourceType ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">{item.audit.resourceType}</span> : null}
                    {item.audit?.resourceLabel ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">{item.audit.resourceLabel}</span> : null}
                    {item.audit?.relatedOrderId ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">订单 #{item.audit.relatedOrderId}</span> : null}
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 font-medium ${severityTone[item.severity] || ""}`}>{item.severity === "critical" ? "高危" : "警告"}</span>
                  <div className="flex items-center gap-1 text-muted-foreground"><Activity className="w-3.5 h-3.5" /> 风险分：{item.riskScore}</div>
                </div>
                <div className="space-y-2 text-xs">
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 font-medium ${statusTone[item.status] || ""}`}>{item.status === "open" ? "未处理" : item.status === "acknowledged" ? "已确认" : "已关闭"}</span>
                  <div className="flex items-center gap-1 text-muted-foreground"><Waves className="w-3.5 h-3.5" /> 升级等级：L{item.escalationLevel}</div>
                  <div className="text-muted-foreground">上次升级：{formatDate(item.lastEscalatedAt)}</div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>{item.actorUser?.name || item.actorUser?.email || item.actorUser?.openId || "系统"}</div>
                  <div>首次发现：{formatDate(item.firstSeenAt)}</div>
                  <div>最近命中：{formatDate(item.lastSeenAt)}</div>
                  <div>负责人：{item.ownerUser?.name || item.ownerUser?.email || item.ownerUser?.openId || "未指派"}</div>
                  {item.ackDueAt ? <div>确认时限：{formatDate(item.ackDueAt)}</div> : null}
                  {item.resolveDueAt ? <div>关闭时限：{formatDate(item.resolveDueAt)}</div> : null}
                  {item.acknowledgedAt ? <div>确认于：{formatDate(item.acknowledgedAt)}</div> : null}
                  {item.resolvedAt ? <div>关闭于：{formatDate(item.resolvedAt)}</div> : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button size="sm" variant="outline" disabled={busy || item.status !== "open"} onClick={() => handleActionWithNote("ack", item.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" />确认
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy || item.status === "resolved"} onClick={() => handleActionWithNote("escalate", item.id)}>
                    <AlertTriangle className="w-4 h-4 mr-1" />升级
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => runAutomationMutation.mutate({ incidentId: item.id })}>
                    <Bot className="w-4 h-4 mr-1" />跑规则
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => claimMutation.mutate({ incidentId: item.id })}>
                    认领
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => handleAssignOwner(item.id)}>
                    指派
                  </Button>
                  <Button size="sm" disabled={busy || item.status === "resolved"} onClick={() => handleActionWithNote("resolve", item.id)}>
                    <TimerReset className="w-4 h-4 mr-1" />关闭
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><NotebookPen className="w-4 h-4" /> 风控处置 SOP</h2>
                <p className="text-xs text-muted-foreground mt-1">每条高危事件可以自动挂到一份 SOP，供值班人员照单执行。</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleQuickCreatePlaybook}>新建 SOP</Button>
            </div>
            <div className="space-y-3">
              {(playbooksQuery.data ?? []).map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{item.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">#{item.id} · {item.code} · {item.triggerSeverity === "all" ? "全部级别" : item.triggerSeverity === "critical" ? "高危" : "警告"}</div>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${item.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>{item.enabled ? "启用中" : "已停用"}</span>
                  </div>
                  {item.summary ? <p className="text-xs text-muted-foreground mt-2">{item.summary}</p> : null}
                  {item.checklist ? <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground bg-secondary rounded-lg p-3">{item.checklist}</pre> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Bot className="w-4 h-4" /> 自动化处置规则</h2>
                <p className="text-xs text-muted-foreground mt-1">命中规则后会自动挂 SOP、自动确认或自动升级。</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleQuickCreateRule}>新建规则</Button>
            </div>
            <div className="space-y-3">
              {(rulesQuery.data ?? []).map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{item.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{item.triggerSeverity === "all" ? "全部级别" : item.triggerSeverity === "critical" ? "高危" : "警告"} · 风险分≥{item.minRiskScore}</div>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${item.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>{item.enabled ? "启用中" : "已停用"}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-2">
                    {item.actionType ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">动作：{item.actionType}</span> : null}
                    {item.resourceType ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">资源：{item.resourceType}</span> : null}
                    {item.playbook?.name ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">SOP：{item.playbook.name}</span> : null}
                    {item.autoAcknowledge ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">自动确认</span> : null}
                    {item.autoEscalate ? <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">自动升级</span> : null}
                  </div>
                  {item.executionNote ? <p className="text-xs text-muted-foreground mt-2">{item.executionNote}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">SLA 规则</h2>
                <p className="text-xs text-muted-foreground mt-1">定义不同风险级别需要在多久内确认和关闭。</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleQuickCreateSla}>新建 SLA</Button>
            </div>
            <div className="space-y-3">
              {(slaPoliciesQuery.data ?? []).map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 ${item.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>{item.enabled ? "启用中" : "已停用"}</span>
                  </div>
                  <div className="mt-2 text-muted-foreground">{item.triggerSeverity === "all" ? "全部级别" : item.triggerSeverity === "critical" ? "高危" : "警告"} · 首次确认 {item.acknowledgeMinutes} 分钟 · 关闭 {item.resolveMinutes} 分钟</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">值班指派中心</h2>
                <p className="text-xs text-muted-foreground mt-1">定义高危动作默认挂给谁处理，也支持人工认领和改派。</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleQuickCreateOncall}>新建值班</Button>
            </div>
            <div className="space-y-3">
              {(oncallAssignmentsQuery.data ?? []).map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 ${item.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>{item.enabled ? "启用中" : "已停用"}</span>
                  </div>
                  <div className="mt-2 text-muted-foreground">{item.user?.name || item.user?.email || item.user?.openId} · {item.triggerSeverity === "all" ? "全部级别" : item.triggerSeverity === "critical" ? "高危" : "警告"}{item.isPrimary ? " · 主值班" : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">最近自动化执行</h2>
              <p className="text-xs text-muted-foreground mt-1">风控规则命中后会在这里留下自动处置记录。你也可以对单个事件手动再跑一次。</p>
            </div>
          </div>
          <div className="space-y-3">
            {(executionsQuery.data ?? []).slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-foreground">{item.rule?.name || `规则 #${item.ruleId}`}</div>
                  <div className="text-muted-foreground">事件 #{item.incidentId} · {formatDate(item.executedAt || item.createdAt)}</div>
                </div>
                <div className="mt-2 text-muted-foreground">{item.executionSummary || "-"}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
