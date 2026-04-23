import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  FileBox,
  ImageIcon,
  Loader2,
  PlaySquare,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { confirmDangerousAction } from "@/lib/adminDanger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fileToDataUrl,
  formatBytes,
  getMediaTypeFromFile,
  getVideoDuration,
  uploadFileToSignedUrl,
} from "@/lib/file-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const filters = [
  { label: "全部", value: "all" as const },
  { label: "图片", value: "image" as const },
  { label: "视频", value: "video" as const },
  { label: "文件", value: "file" as const },
];

const transcodeOptions = [
  { value: "none", label: "未转码" },
  { value: "queued", label: "已排队" },
  { value: "processing", label: "转码中" },
  { value: "ready", label: "已就绪" },
  { value: "failed", label: "转码失败" },
] as const;

const jobStatusLabels: Record<string, string> = {
  queued: "排队中",
  dispatched: "已派发",
  processing: "处理中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

type PlaybackDraft = {
  posterUrl: string;
  hlsManifestKey: string;
  hlsManifestUrl: string;
  transcodeStatus: (typeof transcodeOptions)[number]["value"];
};

function getDefaultDraft(asset: any): PlaybackDraft {
  return {
    posterUrl: asset.posterUrl ?? "",
    hlsManifestKey: asset.hlsManifestKey ?? "",
    hlsManifestUrl: asset.hlsManifestUrl ?? "",
    transcodeStatus: asset.transcodeStatus ?? "none",
  };
}

export default function AdminMedia() {
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [uploadPolicy, setUploadPolicy] = useState<"smart" | "public" | "protected">("smart");
  const [drafts, setDrafts] = useState<Record<number, PlaybackDraft>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();
  const { data: assets, isLoading } = trpc.media.list.useQuery(
    filter === "all" ? undefined : { type: filter }
  );
  const { data: jobs } = trpc.media.jobs.useQuery({ limit: 100 });

  const invalidateMedia = async () => {
    await Promise.all([
      utils.media.list.invalidate(),
      utils.media.jobs.invalidate(),
    ]);
  };

  const prepareUploadMutation = trpc.media.prepareUpload.useMutation();
  const completeUploadMutation = trpc.media.completeUpload.useMutation({
    onSuccess: invalidateMedia,
  });
  const uploadMutation = trpc.media.upload.useMutation({
    onSuccess: invalidateMedia,
  });
  const updatePlaybackMutation = trpc.media.updatePlayback.useMutation({
    onSuccess: async () => {
      await invalidateMedia();
      toast.success("播放元数据已保存");
    },
    onError: (error) => toast.error(`保存失败：${error.message}`),
  });
  const queueTranscodeMutation = trpc.media.queueTranscode.useMutation({
    onSuccess: async () => {
      await invalidateMedia();
      toast.success("已创建转码任务");
    },
    onError: (error) => toast.error(`排队失败：${error.message}`),
  });
  const dispatchTranscodeMutation = trpc.media.dispatchTranscode.useMutation({
    onSuccess: async (result) => {
      await invalidateMedia();
      const warningText = result?.payload?.warnings?.length ? `，但有提醒：${result.payload.warnings.join("；")}` : "";
      toast.success(result.mode === "webhook" ? `转码任务已自动派发${warningText}` : `已生成手动派发任务载荷${warningText}`);
    },
    onError: (error) => toast.error(`派发失败：${error.message}`),
  });
  const retryTranscodeMutation = trpc.media.retryTranscode.useMutation({
    onSuccess: async () => {
      await invalidateMedia();
      toast.success("转码任务已重置为待派发");
    },
    onError: (error) => toast.error(`重试失败：${error.message}`),
  });
  const applyTranscodeCallbackMutation = trpc.media.applyTranscodeCallback.useMutation({
    onSuccess: async () => {
      await invalidateMedia();
      toast.success("已模拟写入转码回调");
    },
    onError: (error) => toast.error(`模拟回调失败：${error.message}`),
  });

  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: async () => {
      await invalidateMedia();
      toast.success("媒体已删除");
    },
    onError: (error) => toast.error(`删除失败：${error.message}`),
  });

  const grouped = useMemo(() => assets ?? [], [assets]);
  const latestJobByMediaId = useMemo(() => {
    const map = new Map<number, any>();
    for (const job of jobs ?? []) {
      if (!map.has(job.mediaId)) map.set(job.mediaId, job);
    }
    return map;
  }, [jobs]);
  const isUploading = prepareUploadMutation.isPending || completeUploadMutation.isPending || uploadMutation.isPending;

  const getDraft = (asset: any) => drafts[asset.id] ?? getDefaultDraft(asset);
  const updateDraft = (assetId: number, patch: Partial<PlaybackDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] ?? getDefaultDraft((assets ?? []).find((item) => item.id === assetId) ?? {})),
        ...patch,
      },
    }));
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    try {
      for (const file of files) {
        const type = getMediaTypeFromFile(file);
        const duration = type === "video" ? await getVideoDuration(file) : undefined;
        const accessLevel = uploadPolicy === "smart" ? (type === "image" ? "public" : "protected") : uploadPolicy;
        const prepared = await prepareUploadMutation.mutateAsync({
          type,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          duration,
          accessLevel,
        });

        if (prepared.mode === "direct") {
          await uploadFileToSignedUrl({
            file,
            uploadUrl: prepared.uploadUrl,
            method: prepared.method,
            headers: prepared.headers,
          });
          await completeUploadMutation.mutateAsync({
            type,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
            duration,
            storageKey: prepared.key,
            url: prepared.objectUrl,
            accessLevel,
          });
        } else {
          const base64 = await fileToDataUrl(file);
          await uploadMutation.mutateAsync({
            type,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            base64,
            duration,
            accessLevel,
          });
        }
      }
      toast.success("媒体上传成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">媒体中心</h1>
            <p className="text-sm text-muted-foreground mt-1">
              这版除了播放票据和 HLS 预留，还补上了真实的转码任务表、外部回调落库、以及给转码器拉取受保护源视频的安全入口。
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={uploadPolicy} onValueChange={(value: any) => setUploadPolicy(value)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="上传策略" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">智能默认</SelectItem>
                <SelectItem value="public">全部公开</SelectItem>
                <SelectItem value="protected">全部受保护</SelectItem>
              </SelectContent>
            </Select>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <Button className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              上传媒体
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground space-y-2">
          <p>转码派发逻辑已经接通：配置 `TRANSCODE_WEBHOOK_URL` 后，后台会把任务载荷自动 POST 给外部 worker；不配置时也可以先用“派发任务”拿到手动模式载荷，再手动回调。</p>
          <p>要让外部 worker 能拉取本地受保护视频并回调本站，记得配置 `PUBLIC_APP_URL`。</p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item.value}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === item.value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-20 text-center">
            <FileBox className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">当前筛选下还没有媒体文件</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {grouped.map((asset) => {
              const draft = getDraft(asset);
              const latestJob = latestJobByMediaId.get(asset.id);
              return (
                <div key={asset.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden">
                    {asset.type === "image" ? (
                      <img src={asset.deliveryUrl ?? asset.url} alt={asset.originName} className="w-full h-full object-cover" />
                    ) : asset.type === "video" ? (
                      <video src={asset.deliveryUrl ?? asset.url} controls poster={asset.posterUrl ?? undefined} className="w-full h-full object-cover" />
                    ) : (
                      <FileBox className="w-10 h-10 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{asset.originName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{asset.mimeType || "未知类型"}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground shrink-0">
                        {asset.type === "image" ? "图片" : asset.type === "video" ? "视频" : "文件"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {asset.type === "image" ? <ImageIcon className="w-3.5 h-3.5" /> : asset.type === "video" ? <Video className="w-3.5 h-3.5" /> : <FileBox className="w-3.5 h-3.5" />}
                        {formatBytes(asset.size)}
                      </span>
                      <span>{asset.source === "storage" ? "对象存储" : "本地存储"}</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
                        <ShieldCheck className="w-3 h-3" />
                        {asset.accessLevel === "protected" ? "受保护" : "公开"}
                      </span>
                      {asset.duration ? <span>{asset.duration}s</span> : null}
                      {asset.type === "video" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
                          <Zap className="w-3 h-3" />
                          {transcodeOptions.find((item) => item.value === asset.transcodeStatus)?.label ?? "未转码"}
                        </span>
                      ) : null}
                    </div>

                    {asset.type === "video" ? (
                      <>
                        <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-3">
                          <div className="grid grid-cols-1 gap-2">
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-1">封面 URL</label>
                              <Input value={draft.posterUrl} onChange={(event) => updateDraft(asset.id, { posterUrl: event.target.value })} placeholder="可选，播放器封面" className="text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-1">HLS Manifest URL</label>
                              <Input value={draft.hlsManifestUrl} onChange={(event) => updateDraft(asset.id, { hlsManifestUrl: event.target.value })} placeholder="例如 https://cdn.example.com/video/master.m3u8" className="text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-1">HLS Manifest Storage Key</label>
                              <Input value={draft.hlsManifestKey} onChange={(event) => updateDraft(asset.id, { hlsManifestKey: event.target.value })} placeholder="如果 playlist 在对象存储内可填写 key" className="text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-1">转码状态</label>
                              <Select value={draft.transcodeStatus} onValueChange={(value: any) => updateDraft(asset.id, { transcodeStatus: value })}>
                                <SelectTrigger className="text-xs">
                                  <SelectValue placeholder="选择状态" />
                                </SelectTrigger>
                                <SelectContent>
                                  {transcodeOptions.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={updatePlaybackMutation.isPending}
                              onClick={() => updatePlaybackMutation.mutate({
                                id: asset.id,
                                posterUrl: draft.posterUrl || null,
                                hlsManifestUrl: draft.hlsManifestUrl || null,
                                hlsManifestKey: draft.hlsManifestKey || null,
                                transcodeStatus: draft.transcodeStatus,
                              })}
                            >
                              {updatePlaybackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlaySquare className="w-3.5 h-3.5" />}
                              保存播放元数据
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="gap-1.5"
                              disabled={queueTranscodeMutation.isPending}
                              onClick={() => queueTranscodeMutation.mutate({ id: asset.id })}
                            >
                              {queueTranscodeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                              创建转码任务
                            </Button>
                          </div>
                        </div>

                        {latestJob ? (
                          <div className="rounded-xl border border-border bg-background p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">最近任务 #{latestJob.id}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {jobStatusLabels[latestJob.status] ?? latestJob.status} · 进度 {latestJob.progress ?? 0}% · {latestJob.provider}
                                </p>
                              </div>
                              <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                                {jobStatusLabels[latestJob.status] ?? latestJob.status}
                              </span>
                            </div>
                            {latestJob.externalJobId ? (
                              <p className="text-[11px] text-muted-foreground break-all">外部任务号：{latestJob.externalJobId}</p>
                            ) : null}
                            {latestJob.errorMessage ? (
                              <div className="rounded-lg bg-destructive/10 text-destructive text-xs px-3 py-2">{latestJob.errorMessage}</div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={dispatchTranscodeMutation.isPending}
                                onClick={() => dispatchTranscodeMutation.mutate({ jobId: latestJob.id })}
                              >
                                {dispatchTranscodeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlaySquare className="w-3.5 h-3.5" />}
                                派发任务
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={retryTranscodeMutation.isPending}
                                onClick={() => retryTranscodeMutation.mutate({ jobId: latestJob.id })}
                              >
                                {retryTranscodeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                重置重试
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={applyTranscodeCallbackMutation.isPending || (!draft.hlsManifestKey && !draft.hlsManifestUrl)}
                                onClick={() => applyTranscodeCallbackMutation.mutate({
                                  jobId: latestJob.id,
                                  status: "ready",
                                  progress: 100,
                                  posterUrl: draft.posterUrl || null,
                                  hlsManifestKey: draft.hlsManifestKey || null,
                                  hlsManifestUrl: draft.hlsManifestUrl || null,
                                })}
                              >
                                {applyTranscodeCallbackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                模拟完成回调
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={async () => {
                          await navigator.clipboard.writeText(asset.deliveryUrl ?? asset.url);
                          toast.success("分发链接已复制");
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />复制分发链接
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive gap-1.5"
                        onClick={() => {
                          const confirmText = confirmDangerousAction("media.delete", `即将删除媒体：${asset.originName}`);
                          if (!confirmText) return;
                          deleteMutation.mutate({ id: asset.id, confirmText });
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />删除
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
