import { useEffect, useMemo } from "react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  ReceiptText,
  RefreshCcw,
  ShieldAlert,
  Smartphone,
  WalletCards,
  XCircle,
  Bell,
  Mail,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

function formatPrice(priceCents?: number | null) {
  return `¥${((priceCents ?? 0) / 100).toFixed(2)}`;
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

function getQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

const providerMeta: Record<string, { label: string; icon: any }> = {
  alipay: { label: "支付宝", icon: WalletCards },
  wechat: { label: "微信支付", icon: Smartphone },
  mock: { label: "模拟支付", icon: ReceiptText },
};

type PaymentView = "pending" | "success" | "failed" | "refunded";

function resolvePaymentView(order: any, session: any, latestCallback: any): PaymentView {
  if (order?.status === "paid") return "success";
  if (order?.status === "refunded") return "refunded";
  if (order?.status === "cancelled") return "failed";
  if (session?.status === "failed" || session?.status === "expired") return "failed";
  if (latestCallback?.status === "failed" || latestCallback?.status === "cancelled") return "failed";
  return "pending";
}

function buildViewMeta(view: PaymentView) {
  switch (view) {
    case "success":
      return {
        badge: "支付成功页",
        title: "支付成功，权益已到账",
        subtitle: "支付渠道回调已经生效，会员权益、单课权限和学习入口都已经刷新。你现在可以直接去学习，不用再手动刷新账户。",
      };
    case "failed":
      return {
        badge: "支付失败页",
        title: "支付未完成或会话已失效",
        subtitle: "这笔支付没有完成到账。你可以重新打开支付页，或者回到购买页重新发起一次支付。站内消息和邮件投递记录也会同步显示在消息中心。",
      };
    case "refunded":
      return {
        badge: "退款结果页",
        title: "订单已退款，相关权益已回收",
        subtitle: "退款回调已经落库，订单权益会自动回收。你可以去消息中心查看站内信和邮件记录，确认这笔退款的处理结果。",
      };
    default:
      return {
        badge: "支付处理中",
        title: "正在确认支付结果",
        subtitle: "当前页面会自动轮询订单状态。只要渠道回调打到你的服务端，这里就会自动切换到成功页或失败页，不需要你手动猜测到账状态。",
      };
  }
}

export default function PaymentResult() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const orderNo = getQueryParam("orderNo");
  const checkoutToken = getQueryParam("checkoutToken");
  const provider = getQueryParam("provider");

  const statusQuery = trpc.commerce.checkoutStatus.useQuery(
    { orderNo: orderNo || undefined, checkoutToken: checkoutToken || undefined },
    {
      enabled: isAuthenticated && Boolean(orderNo || checkoutToken),
      refetchInterval: (query) => {
        const data = query.state.data as any;
        if (!data?.shouldPoll) return false;
        return 2500;
      },
      refetchOnWindowFocus: true,
    }
  );

  const cancelOrderMutation = trpc.commerce.cancelMyOrder.useMutation({
    onSuccess: () => statusQuery.refetch(),
  });

  useEffect(() => {
    if (statusQuery.data?.order?.status === "paid") {
      void Promise.all([
        utils.commerce.myAccess.invalidate(),
        utils.commerce.overview.invalidate(),
        utils.commerce.myOrders.invalidate(),
        utils.progress.myOverview.invalidate(),
        utils.notification.inbox.invalidate(),
        utils.notification.unreadCount.invalidate(),
        utils.notification.emails.invalidate(),
      ]);
    }
  }, [statusQuery.data?.order?.status]);

  const session = statusQuery.data?.session;
  const order = statusQuery.data?.order;
  const latestCallback = statusQuery.data?.callbacks?.[0];
  const reopenUrl = session?.checkoutToken ? `/api/payments/session/${session.checkoutToken}/view` : null;
  const primaryProvider = provider || session?.provider || order?.paymentMethod || "mock";
  const providerInfo = providerMeta[primaryProvider] || providerMeta.mock;
  const ProviderIcon = providerInfo.icon;
  const resolvedView = resolvePaymentView(order, session, latestCallback);
  const viewMeta = useMemo(() => buildViewMeta(resolvedView), [resolvedView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!order && !session && !latestCallback) return;
    const targetPath = `/payment/${resolvedView}`;
    const currentPath = window.location.pathname || location;
    if (currentPath !== targetPath) {
      navigate(`${targetPath}${window.location.search}`);
    }
  }, [resolvedView, order?.status, session?.status, latestCallback?.status]);

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-24 text-center max-w-2xl">
          <ReceiptText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-foreground mb-3">登录后查看支付结果</h1>
          <p className="text-sm text-muted-foreground mb-6">到账状态、会员权益、站内信和邮件投递记录都会在登录后自动刷新。</p>
          <Button onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-5xl space-y-6">
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium mb-4">
            <ProviderIcon className="w-3.5 h-3.5" />
            {providerInfo.label} · {viewMeta.badge}
          </div>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-foreground mb-2">{viewMeta.title}</h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{viewMeta.subtitle}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3 min-w-[220px]">
              <p className="text-xs text-muted-foreground">订单号</p>
              <p className="text-sm font-medium text-foreground mt-1 break-all">{order?.orderNo || orderNo || "-"}</p>
              <p className="text-xs text-muted-foreground mt-3">支付方式</p>
              <p className="text-sm font-medium text-foreground mt-1">{providerInfo.label}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                {statusQuery.isFetching && resolvedView === "pending" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : resolvedView === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : resolvedView === "refunded" ? (
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                ) : resolvedView === "failed" ? (
                  <XCircle className="w-5 h-5 text-rose-500" />
                ) : (
                  <Clock3 className="w-5 h-5 text-primary" />
                )}
                <h2 className="text-lg font-semibold text-foreground">到账状态</h2>
              </div>

              {!order && statusQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">正在读取订单状态…</div>
              ) : !order ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  没有读取到订单。请确认链接里的 <code>orderNo</code> 或 <code>checkoutToken</code> 是否正确。
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-border bg-background px-4 py-3">
                      <p className="text-xs text-muted-foreground">订单金额</p>
                      <p className="text-lg font-semibold text-foreground mt-1">{formatPrice(order.amountCents)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background px-4 py-3">
                      <p className="text-xs text-muted-foreground">订单状态</p>
                      <p className="text-lg font-semibold text-foreground mt-1">{order.status}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background px-4 py-3">
                      <p className="text-xs text-muted-foreground">会话状态</p>
                      <p className="text-lg font-semibold text-foreground mt-1">{session?.status || "-"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background px-4 py-3">
                      <p className="text-xs text-muted-foreground">支付时间</p>
                      <p className="text-sm font-medium text-foreground mt-1">{formatDate(order.paidAt)}</p>
                    </div>
                  </div>

                  {resolvedView === "success" ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                      这笔订单已经支付成功，权益也已经到账。站内信和邮件投递状态都已同步到消息中心，你可以直接去学习，也可以回头审计通知链路。
                    </div>
                  ) : resolvedView === "refunded" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 text-sm text-amber-700 dark:text-amber-300">
                      这笔订单已经退款，相关权益会自动回收。退款金额：{formatPrice(order.refundAmountCents)}。
                    </div>
                  ) : resolvedView === "failed" ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-4 text-sm text-rose-700 dark:text-rose-300">
                      这次支付没有完成到账。常见情况包括支付取消、会话过期、支付失败回调已记录。你可以重新发起支付，或去消息中心核对通知状态。
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                      页面正在自动确认支付结果。只要支付渠道的异步回调抵达，这里会自动切换成成功页或失败页。
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <RefreshCcw className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">下一步</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {resolvedView === "success" && order?.course?.slug ? (
                  <Link href={`/course/${order.course.slug}`}>
                    <Button>进入课程学习</Button>
                  </Link>
                ) : null}
                {resolvedView === "success" ? (
                  <Link href="/me">
                    <Button variant="outline">去学习中心</Button>
                  </Link>
                ) : null}
                <Link href="/notifications">
                  <Button variant="outline" className="gap-2">
                    <Bell className="w-4 h-4" />
                    查看消息中心
                  </Button>
                </Link>
                {reopenUrl && order?.status === "pending" ? (
                  <Button variant="outline" onClick={() => window.open(reopenUrl, "_blank", "noopener,noreferrer")}>重新打开支付页</Button>
                ) : null}
                {order?.status === "pending" ? (
                  <Button variant="ghost" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>
                    {statusQuery.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    手动刷新状态
                  </Button>
                ) : null}
                {order?.status === "pending" ? (
                  <Button variant="destructive" onClick={() => cancelOrderMutation.mutate({ orderId: order.id })} disabled={cancelOrderMutation.isPending}>
                    取消订单
                  </Button>
                ) : null}
                <Link href="/pricing">
                  <Button variant="outline">返回购买页</Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">订单摘要</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">商品</p>
                  <p className="text-foreground font-medium mt-1">{order?.productSnapshotTitle || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">订单创建时间</p>
                  <p className="text-foreground font-medium mt-1">{formatDate(order?.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">会话过期时间</p>
                  <p className="text-foreground font-medium mt-1">{formatDate(session?.expiresAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">渠道单号</p>
                  <p className="text-foreground font-medium mt-1 break-all">{order?.providerTradeNo || "-"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">最近回调</h2>
              {latestCallback ? (
                <div className="rounded-2xl border border-border bg-background p-4 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{latestCallback.provider}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(latestCallback.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground">状态：{latestCallback.status} · 处理结果：{latestCallback.resultStatus}</p>
                  <p className="text-foreground">{latestCallback.resultMessage || "渠道回调已记录。"}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  暂时还没有收到支付渠道回调。只要支付平台把异步通知打到你的服务端，这里会自动刷新。
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">P12 新增</h2>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2"><Bell className="w-4 h-4" /> 支付成功、失败、退款现在都会同步写入站内消息中心。</p>
                <p className="inline-flex items-center gap-2"><Mail className="w-4 h-4" /> 同步生成邮件投递记录，后续可直接接入你的邮件服务商 Webhook。</p>
                <p className="inline-flex items-center gap-2"><Badge variant="outline">{resolvedView}</Badge> 结果页现在会细分为成功 / 失败 / 退款 / 等待中四种路由状态。</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
