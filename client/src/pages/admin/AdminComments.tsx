import { useMemo, useState } from "react";
import { Trash2, MessageSquare, Star, Loader2, Search, Check, X, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
] as const;

type StatusValue = (typeof statusOptions)[number]["value"];

function StatusBadge({ status }: { status: StatusValue | "pending" | "approved" | "rejected" }) {
  const cls =
    status === "approved"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : status === "rejected"
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  const label = status === "approved" ? "已通过" : status === "rejected" ? "已拒绝" : "待审核";
  return <span className={`text-xs px-2 py-1 rounded-full ${cls}`}>{label}</span>;
}

export default function AdminComments() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusValue>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: comments, isLoading } = trpc.comment.adminList.useQuery({ status });

  const refresh = () => {
    utils.comment.adminList.invalidate();
    utils.comment.listByCourse.invalidate();
    utils.course.list.invalidate();
    utils.course.getBySlug.invalidate();
  };

  const deleteMutation = trpc.comment.delete.useMutation({
    onSuccess: () => {
      refresh();
      setDeleteId(null);
      toast.success("评论已删除");
    },
    onError: (e) => toast.error(`删除失败：${e.message}`),
  });

  const statusMutation = trpc.comment.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      refresh();
      toast.success(vars.status === "approved" ? "评论已通过" : vars.status === "rejected" ? "评论已拒绝" : "已改回待审核");
    },
    onError: (e) => toast.error(`操作失败：${e.message}`),
  });

  const filtered = useMemo(
    () =>
      (comments ?? []).filter((c) =>
        search
          ? c.content.includes(search) ||
            c.user?.name?.includes(search) ||
            c.course?.title?.includes(search)
          : true
      ),
    [comments, search]
  );

  const summary = useMemo(() => {
    const rows = comments ?? [];
    return {
      pending: rows.filter((item) => item.status === "pending").length,
      approved: rows.filter((item) => item.status === "approved").length,
      rejected: rows.filter((item) => item.status === "rejected").length,
    };
  }, [comments]);

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-foreground">评论管理</h1>
            <p className="text-sm text-muted-foreground mt-1">共 {filtered.length} 条评论，先把待审核清掉，前台内容才会干净。</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><Clock3 className="w-3.5 h-3.5" />待审核 {summary.pending}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><Check className="w-3.5 h-3.5" />已通过 {summary.approved}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5"><X className="w-3.5 h-3.5" />已拒绝 {summary.rejected}</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索评论内容、用户或课程..."
              className="pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statusOptions.map((item) => (
              <button
                key={item.value}
                onClick={() => setStatus(item.value)}
                className={`px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  status === item.value
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">当前筛选下暂无评论</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="divide-y divide-border">
              {filtered.map((comment) => (
                <div key={comment.id} className="flex gap-4 p-4 hover:bg-secondary/30 transition-colors">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs bg-secondary text-foreground">
                      {comment.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{comment.user?.name ?? "匿名用户"}</span>
                      <StatusBadge status={comment.status as StatusValue} />
                      {comment.parentId ? <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground">回复</span> : null}
                      {comment.rating ? (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: comment.rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      ) : null}
                      <span className="text-xs text-muted-foreground">评论了</span>
                      <span className="text-xs font-medium text-foreground">{comment.course?.title ?? "未知课程"}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(comment.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {comment.status !== "approved" ? (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => statusMutation.mutate({ id: comment.id, status: "approved" })}
                          disabled={statusMutation.isPending}
                        >
                          <Check className="w-3.5 h-3.5" />
                          通过
                        </Button>
                      ) : null}
                      {comment.status !== "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => statusMutation.mutate({ id: comment.id, status: "rejected" })}
                          disabled={statusMutation.isPending}
                        >
                          <X className="w-3.5 h-3.5" />
                          拒绝
                        </Button>
                      ) : null}
                      {comment.status !== "pending" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5"
                          onClick={() => statusMutation.mutate({ id: comment.id, status: "pending" })}
                          disabled={statusMutation.isPending}
                        >
                          <Clock3 className="w-3.5 h-3.5" />
                          退回待审
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive ml-auto"
                        onClick={() => setDeleteId(comment.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，评论将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
