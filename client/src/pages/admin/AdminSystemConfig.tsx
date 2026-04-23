import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileClock,
  FileUp,
  History,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasAdminPermission } from "@shared/adminAccess";
import { confirmDangerousAction } from "@/lib/adminDanger";

const categoryLabels: Record<string, string> = {
  site: "站点与回跳",
  storage: "对象存储与媒体",
  email: "邮件与通知",
  payments: "支付渠道",
  alerts: "审计告警",
};

function getStatusTone(ok: boolean) {
  return ok ? "text-emerald-600" : "text-amber-600";
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminSystemConfig() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canManage = hasAdminPermission(user as any, "system.manage");
  const { data: overview, isLoading } = trpc.systemConfig.overview.useQuery();
  const { data: runtimeStatus } = trpc.systemConfig.runtimeStatus.useQuery();
  const { data: auditLogs } = trpc.systemConfig.auditLogs.useQuery({ limit: 40 });
  const { data: snapshots } = trpc.systemConfig.snapshots.useQuery({ limit: 20 });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [testEmail, setTestEmail] = useState("");
  const [exportName, setExportName] = useState("");
  const [exportDescription, setExportDescription] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importRawJson, setImportRawJson] = useState("");
  const [importStrategy, setImportStrategy] = useState<"merge" | "replace">("merge");
  const [importPreview, setImportPreview] = useState<any>(null);

  useEffect(() => {
    if (!overview?.items) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of overview.items as any[]) {
        if (!item) continue;
        if (item.secret) {
          if (!(item.key in next)) next[item.key] = "";
          continue;
        }
        if (!(item.key in next)) {
          next[item.key] = item.hasOverride ? (item.overrideValueRaw || "") : (item.effectiveValueRaw || "");
        }
      }
      return next;
    });
  }, [overview]);

  const grouped = useMemo(() => overview?.categories ?? {}, [overview]);

  const invalidateAll = () => {
    utils.systemConfig.overview.invalidate();
    utils.systemConfig.runtimeStatus.invalidate();
    utils.systemConfig.auditLogs.invalidate();
    utils.systemConfig.snapshots.invalidate();
  };

  const saveMutation = trpc.systemConfig.update.useMutation({
    onSuccess: (_, variables) => {
      invalidateAll();
      if ((overview?.items as any[])?.find((item) => item?.key === variables.settingKey)?.secret) {
        setDrafts((prev) => ({ ...prev, [variables.settingKey]: "" }));
      }
      toast.success("系统配置已保存并立即应用");
    },
    onError: (error) => toast.error(error.message || "保存失败"),
  });

  const clearMutation = trpc.systemConfig.clear.useMutation({
    onSuccess: (_, variables) => {
      invalidateAll();
      const currentItem = (overview?.items as any[])?.find((item) => item?.key === variables.settingKey);
      setDrafts((prev) => ({ ...prev, [variables.settingKey]: currentItem?.envValueRaw || "" }));
      toast.success("已清除后台覆盖，配置已回退");
    },
    onError: (error) => toast.error(error.message || "清除失败"),
  });

  const testEmailMutation = trpc.systemConfig.sendTestEmail.useMutation({
    onSuccess: (result: any) => {
      toast.success(result?.status === "sent" ? "测试邮件已触发" : "测试邮件已记录，请查看投递状态");
      invalidateAll();
    },
    onError: (error) => toast.error(error.message || "测试邮件发送失败"),
  });

  const exportMutation = trpc.systemConfig.exportSnapshot.useMutation({
    onSuccess: (result: any) => {
      invalidateAll();
      downloadTextFile(result.fileName || `system-config-${Date.now()}.json`, result.payload || "{}");
      toast.success("配置快照已导出并保存到历史记录");
    },
    onError: (error) => toast.error(error.message || "导出失败"),
  });

  const previewImportMutation = trpc.systemConfig.previewImport.useMutation({
    onSuccess: (result) => setImportPreview(result),
    onError: (error) => {
      setImportPreview(null);
      toast.error(error.message || "预览失败");
    },
  });

  const importMutation = trpc.systemConfig.importSnapshot.useMutation({
    onSuccess: (result: any) => {
      invalidateAll();
      toast.success(`快照已导入，实际变更 ${result.changedCount ?? 0} 项`);
      setImportOpen(false);
      setImportRawJson("");
      setImportPreview(null);
    },
    onError: (error) => toast.error(error.message || "导入失败"),
  });

  const downloadSnapshotMutation = trpc.systemConfig.downloadSnapshot.useMutation({
    onSuccess: (result: any) => {
      downloadTextFile(result.fileName || `snapshot-${result.snapshotId}.json`, result.payload || "{}");
      toast.success("快照已下载");
    },
    onError: (error) => toast.error(error.message || "下载失败"),
  });

  const restoreMutation = trpc.systemConfig.restoreSnapshot.useMutation({
    onSuccess: (result: any) => {
      invalidateAll();
      toast.success(`快照恢复完成，实际变更 ${result.changedCount ?? 0} 项`);
    },
    onError: (error) => toast.error(error.message || "恢复失败"),
  });

  const saveField = (item: any) => {
    const value = drafts[item.key] ?? "";
    if (item.secret && !value.trim()) {
      toast.error("密钥类配置留空表示不修改，请输入新值后再保存");
      return;
    }
    saveMutation.mutate({ settingKey: item.key, value });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">系统配置中心</h1>
          <p className="text-sm text-muted-foreground mt-1">把支付、邮件、对象存储和运行时配置做成可审计、可导出、可恢复的后台系统。</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground"><ServerCog className="w-4 h-4" /> 站点地址</div>
            <p className="text-xs text-muted-foreground">PUBLIC_APP_URL</p>
            <p className="text-sm text-foreground break-all">{(runtimeStatus as any)?.site?.publicAppUrl || "未配置"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground"><ShieldCheck className="w-4 h-4" /> 存储状态</div>
            <p className={`text-sm font-medium ${getStatusTone(Boolean((runtimeStatus as any)?.storage?.ready))}`}>{(runtimeStatus as any)?.storage?.ready ? "可用" : "待完善"}</p>
            <p className="text-xs text-muted-foreground">驱动：{(runtimeStatus as any)?.storage?.driver || "-"}</p>
            <p className="text-xs text-muted-foreground">直传：{(runtimeStatus as any)?.storage?.directUploadReady ? "已就绪" : "未启用"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Mail className="w-4 h-4" /> 邮件状态</div>
            <p className={`text-sm font-medium ${getStatusTone(Boolean((runtimeStatus as any)?.email?.ready))}`}>{(runtimeStatus as any)?.email?.ready ? "可发信" : "待完善"}</p>
            <p className="text-xs text-muted-foreground">模式：{(runtimeStatus as any)?.email?.mode || "-"}</p>
            <p className="text-xs text-muted-foreground break-all">发件人：{(runtimeStatus as any)?.email?.fromAddress || "未配置"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground"><RefreshCw className="w-4 h-4" /> 支付渠道</div>
            <p className="text-xs text-muted-foreground">默认：{(runtimeStatus as any)?.payments?.defaultProvider || "mock"}</p>
            <div className="space-y-1">
              {(((runtimeStatus as any)?.payments?.supported ?? []) as any[]).map((item) => (
                <div key={item.provider} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className={item.ready ? "text-emerald-600" : "text-amber-600"}>{item.ready ? "已配置" : "未配置"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground">配置快照</h2>
                <p className="text-xs text-muted-foreground mt-1">导出当前后台覆盖配置，导入前先校验预览，恢复时自动写入审计日志。</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Input className="w-52" placeholder="快照名称（可选）" value={exportName} onChange={(e) => setExportName(e.target.value)} />
                <Button onClick={() => exportMutation.mutate({ name: exportName || undefined, description: exportDescription || undefined })} disabled={exportMutation.isPending}>
                  {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
                  导出当前覆盖
                </Button>
                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline"><Upload className="w-4 h-4 mr-1.5" />导入快照</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>导入系统配置快照</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="text-xs text-muted-foreground">快照 JSON</label>
                          <Textarea rows={12} placeholder='粘贴导出的 LearnFlow 系统配置快照 JSON' value={importRawJson} onChange={(e) => setImportRawJson(e.target.value)} />
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground">导入策略</label>
                            <Select value={importStrategy} onValueChange={(value: any) => setImportStrategy(value)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="merge">合并导入</SelectItem>
                                <SelectItem value="replace">全量替换</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button className="w-full" variant="outline" onClick={() => previewImportMutation.mutate({ rawJson: importRawJson, strategy: importStrategy })} disabled={previewImportMutation.isPending || importMutation.isPending || !importRawJson.trim()}>
                            {previewImportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileClock className="w-4 h-4 mr-1.5" />}
                            预览变更
                          </Button>
                          <Button className="w-full" onClick={() => {
                            const confirmText = confirmDangerousAction("system.import", "导入配置快照会立即覆盖后台运行时配置。\n请确认后继续。");
                            if (!confirmText) return;
                            importMutation.mutate({ rawJson: importRawJson, strategy: importStrategy, confirmText });
                          }} disabled={!canManage || importMutation.isPending || !importPreview || (importPreview?.unsupportedKeys?.length ?? 0) > 0}>
                            {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileUp className="w-4 h-4 mr-1.5" />}
                            确认导入
                          </Button>
                        </div>
                      </div>

                      {importPreview ? (
                        <div className="rounded-xl border border-border/70 p-4 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">{importPreview.snapshot?.name || "导入预览"}</p>
                              <p className="text-xs text-muted-foreground mt-1">导入策略：{importPreview.strategy === "replace" ? "全量替换" : "合并导入"} · 导出时间：{importPreview.snapshot?.exportedAt ? formatDate(importPreview.snapshot.exportedAt) : "-"}</p>
                            </div>
                            <div className="text-xs text-muted-foreground">原始项数：{importPreview.summary?.totalItems ?? 0} · 有效项数：{importPreview.summary?.validItems ?? 0}</div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                            {[
                              ["新增", importPreview.summary?.createCount ?? 0],
                              ["更新", importPreview.summary?.updateCount ?? 0],
                              ["清除", importPreview.summary?.clearCount ?? 0],
                              ["不变", importPreview.summary?.unchangedCount ?? 0],
                              ["重复键", importPreview.duplicateKeys?.length ?? 0],
                            ].map(([label, value]) => (
                              <div key={String(label)} className="rounded-lg bg-secondary/60 px-3 py-2">
                                <p className="text-muted-foreground">{label}</p>
                                <p className="text-sm font-medium text-foreground mt-1">{value as any}</p>
                              </div>
                            ))}
                          </div>
                          {(importPreview.unsupportedKeys?.length ?? 0) > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              存在不支持的配置项：{importPreview.unsupportedKeys.join("，")}
                            </div>
                          )}
                          <div className="max-h-64 overflow-auto rounded-lg border border-border/70">
                            <table className="w-full text-xs">
                              <thead className="bg-secondary/50 text-muted-foreground">
                                <tr>
                                  <th className="text-left px-3 py-2">Key</th>
                                  <th className="text-left px-3 py-2">动作</th>
                                  <th className="text-left px-3 py-2">导入前</th>
                                  <th className="text-left px-3 py-2">导入后</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(importPreview.changes ?? []).slice(0, 50).map((item: any) => (
                                  <tr key={`${item.key}-${item.action}`} className="border-t border-border/60">
                                    <td className="px-3 py-2 font-medium text-foreground">{item.key}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.action}</td>
                                    <td className="px-3 py-2 text-muted-foreground break-all">{item.before || "-"}</td>
                                    <td className="px-3 py-2 text-foreground break-all">{item.after || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <Textarea rows={3} placeholder="导出说明（可选）" value={exportDescription} onChange={(e) => setExportDescription(e.target.value)} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">测试邮件</h2>
              <p className="text-xs text-muted-foreground mt-1">先验证后台邮件模式是否真的可用，再继续接真实用户通知。</p>
            </div>
            <Input placeholder="admin@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <Button className="w-full" onClick={() => testEmailMutation.mutate({ to: testEmail })} disabled={!canManage || testEmailMutation.isPending || !testEmail.trim()}>
              {testEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Mail className="w-4 h-4 mr-1.5" />}
              发送测试邮件
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">快照历史</h2>
                <p className="text-xs text-muted-foreground mt-1">导出、导入、恢复都会留下快照记录。</p>
              </div>
              <History className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
              {((snapshots ?? []) as any[]).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">还没有快照记录</div>
              ) : (
                ((snapshots ?? []) as any[]).map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">#{item.id}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{item.snapshotType}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{item.strategy}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{item.description || "无说明"}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{formatDate(item.createdAt)}</p>
                        <p>{item.actorName || item.actorEmail || "系统"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-secondary/60 px-3 py-2"><span className="text-muted-foreground">配置项</span><p className="mt-1 text-foreground">{item.itemCount}</p></div>
                      <div className="rounded-lg bg-secondary/60 px-3 py-2"><span className="text-muted-foreground">校验码</span><p className="mt-1 text-foreground break-all">{item.checksum?.slice(0, 12) || "-"}</p></div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Button variant="outline" size="sm" onClick={() => downloadSnapshotMutation.mutate({ snapshotId: item.id })} disabled={downloadSnapshotMutation.isPending}>
                        <Download className="w-4 h-4 mr-1.5" />下载
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const confirmText = confirmDangerousAction("system.restore", `即将以“合并恢复”的方式恢复快照《${item.name}》。`);
                        if (!confirmText) return;
                        restoreMutation.mutate({ snapshotId: item.id, strategy: "merge", confirmText });
                      }} disabled={!canManage || restoreMutation.isPending}>
                        合并恢复
                      </Button>
                      <Button size="sm" onClick={() => {
                        const confirmText = confirmDangerousAction("system.restore", `即将以“全量替换”的方式恢复快照《${item.name}》。`);
                        if (!confirmText) return;
                        restoreMutation.mutate({ snapshotId: item.id, strategy: "replace", confirmText });
                      }} disabled={!canManage || restoreMutation.isPending}>
                        全量恢复
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">配置审计日志</h2>
                <p className="text-xs text-muted-foreground mt-1">每次手工修改、清除覆盖、导入和恢复都会留下痕迹。</p>
              </div>
              <History className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
              {((auditLogs ?? []) as any[]).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">还没有审计日志</div>
              ) : (
                ((auditLogs ?? []) as any[]).map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{item.settingKey || "批量快照操作"}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{item.action}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{item.changeSource}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{item.actorName || item.actorEmail || "系统"} · {formatDate(item.createdAt)}</p>
                      </div>
                      {item.snapshotName ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{item.snapshotName}</span> : null}
                    </div>
                    {item.settingKey ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-secondary/60 px-3 py-2">
                          <p className="text-muted-foreground">修改前</p>
                          <p className="text-foreground break-all mt-1">{item.previousValuePreview || "-"}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/60 px-3 py-2">
                          <p className="text-muted-foreground">修改后</p>
                          <p className="text-foreground break-all mt-1">{item.nextValuePreview || "-"}</p>
                        </div>
                      </div>
                    ) : null}
                    {item.metadata ? (
                      <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground break-all">
                        {typeof item.metadata === "string" ? item.metadata : JSON.stringify(item.metadata)}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">正在加载系统配置…</div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{categoryLabels[category] || category}</h2>
                <p className="text-xs text-muted-foreground mt-1">保存后会立即覆盖当前运行时配置；清除覆盖后会回退到 .env 或默认值。</p>
              </div>
              <div className="space-y-4">
                {(items as any[]).map((item) => {
                  const dirty = !item.secret && (drafts[item.key] ?? "") !== (item.hasOverride ? (item.overrideValueRaw || "") : (item.effectiveValueRaw || ""));
                  return (
                    <div key={item.key} className="rounded-xl border border-border/70 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{item.label}</p>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{item.key}</span>
                            {item.hasOverride ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">后台覆盖中</span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">沿用 .env / 默认</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {item.source === "override" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          当前来源：{item.source === "override" ? "后台覆盖" : item.source === "env" ? ".env" : "默认值"}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-lg bg-secondary/60 px-3 py-2 space-y-1">
                          <p className="text-muted-foreground">环境值</p>
                          <p className="text-foreground break-all">{item.envValue || "未配置"}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/60 px-3 py-2 space-y-1">
                          <p className="text-muted-foreground">后台覆盖</p>
                          <p className="text-foreground break-all">{item.hasOverride ? item.overrideValue || "已设置为空" : "未覆盖"}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/60 px-3 py-2 space-y-1">
                          <p className="text-muted-foreground">当前生效</p>
                          <p className="text-foreground break-all">{item.effectiveValue || "未配置"}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {item.inputType === "textarea" ? (
                          <Textarea
                            rows={item.secret ? 4 : 5}
                            placeholder={item.secret ? "留空表示不修改现有密钥" : item.placeholder || "请输入配置值"}
                            value={drafts[item.key] ?? ""}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                          />
                        ) : item.inputType === "select" ? (
                          <Select value={(drafts[item.key] ?? (item.hasOverride ? (item.overrideValueRaw || "") : (item.effectiveValueRaw || ""))) || undefined} onValueChange={(value) => setDrafts((prev) => ({ ...prev, [item.key]: value }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="请选择" />
                            </SelectTrigger>
                            <SelectContent>
                              {(item.options ?? []).map((option: any) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={item.inputType === "number" ? "number" : item.secret ? "password" : "text"}
                            placeholder={item.secret ? "留空表示不修改现有密钥" : item.placeholder || "请输入配置值"}
                            value={drafts[item.key] ?? ""}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                          />
                        )}

                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          <Button variant="outline" onClick={() => {
                            const confirmText = confirmDangerousAction("system.clear", `即将清除配置项 ${item.key} 的后台覆盖。`);
                            if (!confirmText) return;
                            clearMutation.mutate({ settingKey: item.key, confirmText });
                          }} disabled={!canManage || (clearMutation.isPending && (clearMutation.variables as any)?.settingKey === item.key)}>
                            <RotateCcw className="w-4 h-4 mr-1.5" />
                            清除覆盖
                          </Button>
                          <Button onClick={() => saveField(item)} disabled={!canManage || Boolean(saveMutation.isPending && (saveMutation.variables as any)?.settingKey === item.key) || (!item.secret && !dirty && !item.hasOverride && !(drafts[item.key] ?? "").trim())}>
                            {saveMutation.isPending && (saveMutation.variables as any)?.settingKey === item.key ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                            保存覆盖
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
