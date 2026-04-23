import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Mail, ReceiptText, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

const eventLabelMap: Record<string, string> = {
  payment_paid: "支付成功",
  payment_failed: "支付失败",
  payment_cancelled: "订单取消",
  payment_refunded: "订单退款",
  benefits_repaired: "权益补发",
  benefits_revoked: "权益回收",
  admin_audit_alert: "后台审计告警",
};

const emailStatusTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "default",
  skipped: "secondary",
  failed: "destructive",
  pending: "outline",
};

export default function NotificationsCenter() {
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const [liveConnected, setLiveConnected] = useState(false);
  const { data: inbox, isLoading: inboxLoading } = trpc.notification.inbox.useQuery({ status: "all", limit: 60 }, { enabled: isAuthenticated, refetchInterval: 30000, refetchOnWindowFocus: true });
  const { data: emailDeliveries, isLoading: emailsLoading } = trpc.notification.emails.useQuery({ limit: 60 }, { enabled: isAuthenticated, refetchInterval: 45000, refetchOnWindowFocus: true });
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000, refetchOnWindowFocus: true });

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notification.inbox.invalidate(),
        utils.notification.unreadCount.invalidate(),
      ]);
    },
  });

  const unreadItems = useMemo(() => (inbox ?? []).filter((item) => !item.readAt), [inbox]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined" || typeof EventSource === "undefined") return;
    const stream = new EventSource("/api/notifications/stream", { withCredentials: true });
    stream.addEventListener("ready", () => setLiveConnected(true));
    stream.addEventListener("snapshot", () => {
      setLiveConnected(true);
      utils.notification.inbox.invalidate();
      utils.notification.emails.invalidate();
      utils.notification.unreadCount.invalidate();
    });
    stream.onerror = () => {
      setLiveConnected(false);
      stream.close();
    };
    return () => {
      setLiveConnected(false);
      stream.close();
    };
  }, [isAuthenticated, utils]);

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-24 text-center max-w-2xl">
          <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-foreground mb-3">登录后查看消息中心</h1>
          <p className="text-sm text-muted-foreground mb-6">支付成功、失败、退款和权益变更，都会同步到站内消息和邮件投递记录。</p>
          <Button onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 space-y-6 max-w-5xl">
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium mb-4">
            <Bell className="w-3.5 h-3.5" />
            P12 · 支付消息中心
          </div>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-foreground mb-2">站内信与邮件投递</h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                这里集中展示与你订单相关的站内通知和邮件投递状态。支付成功、失败、退款、权益补发和回收都会自动同步到这里。
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3 min-w-[220px]">
              <p className="text-xs text-muted-foreground">未读站内信</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{unreadCount ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-3">实时状态</p>
              <p className="text-sm font-medium text-foreground mt-1">{liveConnected ? "实时连接中" : "轮询兜底中"}</p>
              <p className="text-xs text-muted-foreground mt-3">最近邮件记录</p>
              <p className="text-sm font-medium text-foreground mt-1">{emailDeliveries?.length ?? 0} 条</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => markReadMutation.mutate({ all: true })} disabled={markReadMutation.isPending || unreadItems.length === 0}>
              <CheckCheck className="w-4 h-4 mr-2" />
              全部标记已读
            </Button>
            <Link href="/pricing"><Button variant="ghost">返回购买页</Button></Link>
          </div>
        </section>

        <Tabs defaultValue="inbox" className="space-y-4">
          <TabsList>
            <TabsTrigger value="inbox">站内信</TabsTrigger>
            <TabsTrigger value="emails">邮件投递</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="space-y-4">
            {inboxLoading ? (
              <div className="grid grid-cols-1 gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <div className="skeleton h-5 w-48 rounded" />
                    <div className="skeleton h-4 w-full rounded" />
                    <div className="skeleton h-4 w-3/4 rounded" />
                  </div>
                ))}
              </div>
            ) : !inbox || inbox.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                还没有站内通知。等你产生支付动作后，这里会自动出现对应消息。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {inbox.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.readAt ? "outline" : "default"}>{item.readAt ? "已读" : "未读"}</Badge>
                          <Badge variant="secondary">{eventLabelMap[item.eventType] || item.eventType}</Badge>
                          {item.order?.orderNo ? <span className="text-xs text-muted-foreground">订单号：{item.order.orderNo}</span> : null}
                        </div>
                        <h2 className="text-lg font-semibold text-foreground break-words">{item.title}</h2>
                        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{item.content}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {!item.readAt ? (
                          <Button variant="outline" size="sm" onClick={() => markReadMutation.mutate({ ids: [item.id] })} disabled={markReadMutation.isPending}>
                            标记已读
                          </Button>
                        ) : null}
                        {item.actionUrl ? (
                          <Link href={item.actionUrl}>
                            <Button size="sm">查看详情</Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="emails" className="space-y-4">
            {emailsLoading ? (
              <div className="grid grid-cols-1 gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <div className="skeleton h-5 w-48 rounded" />
                    <div className="skeleton h-4 w-full rounded" />
                    <div className="skeleton h-4 w-1/2 rounded" />
                  </div>
                ))}
              </div>
            ) : !emailDeliveries || emailDeliveries.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                还没有邮件投递记录。等支付事件触发后，这里会出现每一封通知邮件的发送状态。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {emailDeliveries.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={emailStatusTone[item.status] || "outline"}>{item.status}</Badge>
                          <Badge variant="secondary">{eventLabelMap[item.eventType] || item.eventType}</Badge>
                          <span className="text-xs text-muted-foreground">{item.provider === "webhook" ? "Webhook 邮件" : item.provider === "resend" ? "Resend 邮件" : "日志模式"}</span>
                        </div>
                        <h2 className="text-lg font-semibold text-foreground break-words">{item.subject}</h2>
                        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{item.contentText}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{item.recipientEmail || "未配置邮箱"}</span>
                          {item.order?.orderNo ? <span>订单号：{item.order.orderNo}</span> : null}
                          <span>创建于 {formatDate(item.createdAt)}</span>
                          <span>最后尝试 {formatDate(item.lastAttemptAt)}</span>
                        </div>
                        {item.lastError ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-xs text-amber-700 dark:text-amber-300 inline-flex items-start gap-2">
                            <ShieldAlert className="w-4 h-4 mt-0.5" />
                            <span>{item.lastError}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        尝试次数：{item.attempts}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
