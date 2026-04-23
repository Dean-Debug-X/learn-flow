import { useState } from "react";
import { BellRing, Loader2, RefreshCw, SendHorizonal, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const eventLabels: Record<string, string> = {
  payment_paid: "支付成功",
  payment_failed: "支付失败",
  payment_cancelled: "支付取消",
  payment_refunded: "退款成功",
  benefits_repaired: "权益补发",
  benefits_revoked: "权益回收",
};

const statusLabels: Record<string, string> = {
  pending: "待发送",
  sent: "已发送",
  failed: "发送失败",
  skipped: "已跳过",
};

const channelLabels: Record<string, string> = {
  log: "站内日志",
  owner: "站长通知",
  webhook: "Webhook",
};

export default function AdminPaymentNotifications() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"all" | "pending" | "sent" | "failed" | "skipped">("all");
  const [channel, setChannel] = useState<"all" | "log" | "owner" | "webhook">("all");
  const [eventType, setEventType] = useState<"all" | "payment_paid" | "payment_failed" | "payment_cancelled" | "payment_refunded" | "benefits_repaired" | "benefits_revoked">("all");

  const { data: notifications, isLoading } = trpc.commerce.adminNotifications.useQuery({ status, channel, eventType, limit: 80 });
  const retryMutation = trpc.commerce.adminRetryNotification.useMutation({
    onSuccess: async () => {
      await utils.commerce.adminNotifications.invalidate();
      toast.success("已重新投递通知");
    },
    onError: (error) => toast.error(`重试失败：${error.message}`),
  });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">支付通知中心</h1>
            <p className="text-sm text-muted-foreground mt-1">查看支付、退款、权益补发与权益回收通知，并对失败通知执行重试。</p>
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
                <SelectItem value="log">站内日志</SelectItem>
                <SelectItem value="owner">站长通知</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventType} onValueChange={(value) => setEventType(value as typeof eventType)}>
              <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部事件</SelectItem>
                <SelectItem value="payment_paid">支付成功</SelectItem>
                <SelectItem value="payment_failed">支付失败</SelectItem>
                <SelectItem value="payment_cancelled">支付取消</SelectItem>
                <SelectItem value="payment_refunded">退款成功</SelectItem>
                <SelectItem value="benefits_repaired">权益补发</SelectItem>
                <SelectItem value="benefits_revoked">权益回收</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_0.8fr_0.7fr_1.1fr_140px] gap-3 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground">
            <div>通知内容</div>
            <div>事件 / 渠道</div>
            <div>状态</div>
            <div>订单 / 时间</div>
            <div className="text-right">操作</div>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">当前筛选条件下没有通知记录。</div>
          ) : (
            notifications.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_0.8fr_0.7fr_1.1fr_140px] gap-3 px-4 py-4 border-b border-border last:border-0 items-start text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <BellRing className="w-4 h-4 shrink-0" />
                    <span className="line-clamp-1">{item.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-line line-clamp-4">{item.content}</p>
                  {item.lastError ? (
                    <div className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 px-2.5 py-1 text-[11px]">
                      <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{item.lastError}</span>
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="text-foreground">{eventLabels[item.eventType] ?? item.eventType}</p>
                  <p>{channelLabels[item.channel] ?? item.channel}</p>
                  <p className="line-clamp-1">{item.recipient ?? "—"}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "sent" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : item.status === "failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" : item.status === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" : "bg-secondary text-muted-foreground"}`}>
                    {statusLabels[item.status] ?? item.status}
                  </span>
                  <p className="text-xs text-muted-foreground mt-2">尝试 {item.attempts} 次</p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>订单：{item.order?.orderNo ?? "未关联"}</p>
                  <p>创建：{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  <p>最后尝试：{item.lastAttemptAt ? new Date(item.lastAttemptAt).toLocaleString("zh-CN") : "无"}</p>
                  <p>发送成功：{item.sentAt ? new Date(item.sentAt).toLocaleString("zh-CN") : "未发送"}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {item.status === "failed" || item.status === "pending" ? (
                    <Button size="sm" variant="outline" onClick={() => retryMutation.mutate({ notificationId: item.id })} disabled={retryMutation.isPending} className="gap-1.5">
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
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
