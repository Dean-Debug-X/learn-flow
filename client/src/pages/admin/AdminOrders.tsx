import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ReceiptText, RefreshCw, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasAdminPermission } from "@shared/adminAccess";
import { confirmDangerousAction } from "@/lib/adminDanger";

function formatPrice(priceCents?: number | null) {
  return `¥${((priceCents ?? 0) / 100).toFixed(2)}`;
}

const statusLabels: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  cancelled: "已取消",
  refunded: "已退款",
};

const callbackStatusLabels: Record<string, string> = {
  received: "已接收",
  applied: "已应用",
  duplicate: "重复回调",
  rejected: "已拒绝",
  ignored: "已忽略",
  error: "处理失败",
};

export default function AdminOrders() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canManage = hasAdminPermission(user as any, "commerce.manage");
  const [status, setStatus] = useState<"all" | "pending" | "paid" | "cancelled" | "refunded">("all");
  const { data: orders, isLoading } = trpc.commerce.adminOrders.useQuery({ status });
  const { data: callbacks } = trpc.commerce.adminPaymentCallbacks.useQuery({ limit: 20 });
  const { data: gatewayStatus } = trpc.commerce.gatewayStatus.useQuery();

  const markPaidMutation = trpc.commerce.adminMarkPaid.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.commerce.adminOrders.invalidate(),
        utils.commerce.adminPaymentCallbacks.invalidate(),
        utils.commerce.overview.invalidate(),
        utils.commerce.myAccess.invalidate(),
      ]);
      toast.success("订单已标记为支付成功，权益已发放");
    },
    onError: (error) => toast.error(`操作失败：${error.message}`),
  });

  const repairBenefitsMutation = trpc.commerce.adminRepairBenefits.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.commerce.adminOrders.invalidate(),
        utils.commerce.adminPaymentCallbacks.invalidate(),
        utils.commerce.overview.invalidate(),
        utils.commerce.myAccess.invalidate(),
      ]);
      toast.success("已执行权益补发");
    },
    onError: (error) => toast.error(`补发失败：${error.message}`),
  });

  const cancelMutation = trpc.commerce.adminCancel.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.commerce.adminOrders.invalidate(),
        utils.commerce.adminPaymentCallbacks.invalidate(),
        utils.commerce.adminNotifications.invalidate(),
      ]);
      toast.success("订单已取消");
    },
    onError: (error) => toast.error(`取消失败：${error.message}`),
  });

  const refundMutation = trpc.commerce.adminRefund.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.commerce.adminOrders.invalidate(),
        utils.commerce.adminPaymentCallbacks.invalidate(),
        utils.commerce.adminNotifications.invalidate(),
        utils.commerce.overview.invalidate(),
        utils.commerce.myAccess.invalidate(),
      ]);
      toast.success("订单已退款，权益已回收");
    },
    onError: (error) => toast.error(`退款失败：${error.message}`),
  });

  const summary = useMemo(() => {
    const rows = orders ?? [];
    return {
      pending: rows.filter((item) => item.status === "pending").length,
      paid: rows.filter((item) => item.status === "paid").length,
      repaired: rows.filter((item) => Number(item.benefitsRepairCount ?? 0) > 0).length,
      refunded: rows.filter((item) => item.status === "refunded").length,
    };
  }, [orders]);

  const loadingAction = markPaidMutation.isPending || cancelMutation.isPending || repairBenefitsMutation.isPending || refundMutation.isPending;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">订单管理</h1>
            <p className="text-sm text-muted-foreground mt-1">查看订单状态、支付回调日志，并对异常订单执行权益补发。</p>
          </div>
          <div className="w-full md:w-48">
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部订单</SelectItem>
                <SelectItem value="pending">待支付</SelectItem>
                <SelectItem value="paid">已支付</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
                <SelectItem value="refunded">已退款</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            {(gatewayStatus?.supported ?? []).map((item) => (
              <span key={item.provider} className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${item.ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                {item.label} {item.ready ? "已就绪" : "未就绪"}
              </span>
            ))}
          </div>
          <a href="/admin/payment-notifications" className="text-sm text-muted-foreground hover:text-foreground transition-colors">查看支付通知中心 →</a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">待支付订单</p>
            <p className="text-2xl font-semibold text-foreground mt-2">{summary.pending}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">已支付订单</p>
            <p className="text-2xl font-semibold text-foreground mt-2">{summary.paid}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">发生过补单</p>
            <p className="text-2xl font-semibold text-foreground mt-2">{summary.repaired}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">已退款订单</p>
            <p className="text-2xl font-semibold text-foreground mt-2">{summary.refunded}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[0.9fr_1.3fr_0.9fr_1fr_1.2fr_220px] gap-3 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground">
            <div>订单号</div>
            <div>商品 / 用户</div>
            <div>金额</div>
            <div>状态</div>
            <div>支付 / 权益</div>
            <div className="text-right">操作</div>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          ) : !orders || orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">当前筛选条件下没有订单。</div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="grid grid-cols-[0.9fr_1.3fr_0.9fr_1fr_1.2fr_220px] gap-3 px-4 py-4 border-b border-border last:border-0 items-start text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground line-clamp-1">{order.orderNo}</p>
                  <p className="text-xs text-muted-foreground mt-1">#{order.id}</p>
                  {order.idempotencyKey ? <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">幂等键：{order.idempotencyKey}</p> : null}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground line-clamp-1">{order.productSnapshotTitle}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                    {order.user?.name ?? "用户"}
                    {order.user?.email ? ` · ${order.user.email}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                    {order.course?.title ? `关联课程：${order.course.title}` : order.product?.type === "vip" ? "会员商品" : "未绑定课程"}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{formatPrice(order.amountCents)}</p>
                  <p className="text-xs text-muted-foreground mt-1">实收：{formatPrice(order.paidAmountCents || order.amountCents)}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${order.status === "paid" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : order.status === "pending" ? "bg-secondary text-muted-foreground" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"}`}>
                    {statusLabels[order.status] ?? order.status}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">支付方式：{order.paymentMethod}</p>
                  {order.providerTradeNo ? <p className="text-xs text-muted-foreground mt-1 line-clamp-1">渠道单号：{order.providerTradeNo}</p> : null}
                  {order.refundReason ? <p className="text-xs text-muted-foreground mt-1 line-clamp-1">退款原因：{order.refundReason}</p> : null}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>创建：{new Date(order.createdAt).toLocaleString("zh-CN")}</p>
                  <p>支付：{order.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN") : "未支付"}</p>
                  <p>退款：{order.refundedAt ? new Date(order.refundedAt).toLocaleString("zh-CN") : "未退款"}</p>
                  <p>回调：{order.paymentCallbackAt ? new Date(order.paymentCallbackAt).toLocaleString("zh-CN") : "无"}</p>
                  <p>权益：{order.benefitsGrantedAt ? `已发放 ${new Date(order.benefitsGrantedAt).toLocaleString("zh-CN")}` : "未确认"}</p>
                  <p>回收：{order.benefitsRevokedAt ? `已回收 ${new Date(order.benefitsRevokedAt).toLocaleString("zh-CN")}` : "未回收"}</p>
                  <p>补发次数：{Number(order.benefitsRepairCount ?? 0)} · 回收次数：{Number(order.benefitsRevokeCount ?? 0)}</p>
                </div>
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {order.status === "pending" ? (
                    canManage ? (
                      <>
                        <Button size="sm" onClick={() => {
                          const confirmText = confirmDangerousAction("commerce.order.markPaid", `即将把订单 ${order.orderNo} 标记为已支付。`);
                          if (!confirmText) return;
                          markPaidMutation.mutate({ orderId: order.id, paymentMethod: "manual", confirmText });
                        }} disabled={loadingAction}>
                          {markPaidMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const confirmText = confirmDangerousAction("commerce.order.cancel", `即将取消订单 ${order.orderNo}。`);
                          if (!confirmText) return;
                          cancelMutation.mutate({ orderId: order.id, confirmText });
                        }} disabled={loadingAction}>
                          {cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        </Button>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">仅可查看</div>
                    )
                  ) : order.status === "paid" ? (
                    canManage ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => repairBenefitsMutation.mutate({ orderId: order.id })} disabled={loadingAction} className="gap-1.5">
                          {repairBenefitsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          补发权益
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const confirmText = confirmDangerousAction("commerce.order.refund", `即将对订单 ${order.orderNo} 执行退款。`);
                          if (!confirmText) return;
                          refundMutation.mutate({ orderId: order.id, refundAmountCents: order.paidAmountCents || order.amountCents, refundReason: "管理员手动退款", paymentMethod: order.paymentMethod, confirmText });
                        }} disabled={loadingAction} className="gap-1.5">
                          {refundMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          执行退款
                        </Button>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">仅可查看</div>
                    )
                  ) : (
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <ReceiptText className="w-3.5 h-3.5" />
                      已处理
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">最近支付回调</h2>
              <p className="text-xs text-muted-foreground mt-1">用于排查重复回调、签名失败和金额不一致。</p>
            </div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              共 {callbacks?.length ?? 0} 条
            </div>
          </div>
          {!callbacks || callbacks.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">还没有支付回调记录。</div>
          ) : (
            callbacks.map((item) => (
              <div key={item.id} className="grid grid-cols-[0.9fr_0.8fr_0.8fr_1.1fr] gap-3 px-4 py-3 border-b border-border last:border-0 items-start text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground line-clamp-1">{item.orderNo || "未关联订单"}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.provider}{item.providerTradeNo ? ` · ${item.providerTradeNo}` : ""}</p>
                </div>
                <div>
                  <p className="text-sm text-foreground">{statusLabels[item.status] ?? item.status}</p>
                  <p className="text-xs text-muted-foreground mt-1">签名：{item.signatureVerified ? "通过" : "失败"}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.resultStatus === "applied" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : item.resultStatus === "rejected" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" : "bg-secondary text-muted-foreground"}`}>
                    {callbackStatusLabels[item.resultStatus] ?? item.resultStatus}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">金额：{formatPrice(item.amountCents)}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ""}</p>
                  <p className="mt-1 line-clamp-2">{item.resultMessage || "—"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
