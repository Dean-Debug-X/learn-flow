import { BookOpen, Clock3, PlayCircle, Sparkles, Heart, Crown, ReceiptText, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

function formatDuration(seconds?: number | null) {
  const safe = Number(seconds ?? 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function MyLearning() {
  const { isAuthenticated, loading } = useAuth();
  const { data, isLoading } = trpc.progress.myOverview.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: commerceData } = trpc.commerce.overview.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-24 text-center">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="mb-2 text-2xl font-semibold text-foreground">登录后查看学习中心</h1>
          <p className="mb-6 text-sm text-muted-foreground">这里会展示你的学习进度、收藏课程和最近学习记录。</p>
          <Button onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
        </div>
      </div>
    );
  }

  const courses = data?.courses ?? [];
  const activities = data?.activities ?? [];
  const favorites = data?.favorites ?? [];
  const commerceOrders = commerceData?.orders ?? [];
  const access = commerceData?.access;
  const completedCount = courses.filter((item) => Number(item.progressPercent ?? 0) >= 100).length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              我的学习中心
            </div>
            <h1 className="mb-2 text-3xl font-semibold text-foreground">继续你的课程</h1>
            <p className="text-sm text-muted-foreground">现在进度、最近学习和收藏都收在这里，方便你回到真正要学的内容。</p>
          </div>
          <div className="grid w-full grid-cols-4 gap-3 md:w-auto">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">已开始课程</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{courses.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">已完成</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{completedCount}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">收藏课程</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{favorites.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">最近记录</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{activities.length}</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-5">
                <div className="skeleton h-5 w-1/2 rounded" />
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : courses.length === 0 && favorites.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card py-20 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-semibold text-foreground">还没有学习记录</h2>
            <p className="mb-6 text-sm text-muted-foreground">去首页找一门课程开学，或者先收藏几门感兴趣的课。</p>
            <Link href="/">
              <Button>去选课程</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              {courses.length > 0 ? (
                courses.map((item) => (
                  <div key={item.progressId} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex flex-col gap-4 md:flex-row">
                      <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-secondary md:w-48">
                        {item.course.coverUrl ? (
                          <img src={item.course.coverUrl ?? undefined} alt={item.course.title ?? "课程封面"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BookOpen className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {item.course.category?.name ? (
                            <span
                              className="rounded-full px-2.5 py-1 text-xs font-medium"
                              style={{
                                backgroundColor: `${item.course.category.color ?? "#6366f1"}18`,
                                color: item.course.category.color ?? "#6366f1",
                              }}
                            >
                              {item.course.category.name}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                            {Number(item.progressPercent ?? 0) >= 100 ? "已完成" : "学习中"}
                          </span>
                        </div>
                        <h2 className="mb-2 line-clamp-1 text-lg font-semibold text-foreground">{item.course.title}</h2>
                        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{item.course.description ?? "这门课程还没有补充描述。"}</p>
                        <div className="mb-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>学习进度</span>
                            <span>{Number(item.progressPercent ?? 0)}%</span>
                          </div>
                          <Progress value={Number(item.progressPercent ?? 0)} />
                        </div>
                        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          {item.course.duration ? (
                            <span className="flex items-center gap-1.5">
                              <Clock3 className="h-3.5 w-3.5" />
                              总时长 {formatDuration(item.course.duration)}
                            </span>
                          ) : null}
                          <span>最近更新 {item.updatedAt ? new Date(item.updatedAt).toLocaleString("zh-CN") : "-"}</span>
                        </div>
                        <Link href={`/course/${item.course.slug}`}>
                          <Button className="gap-1.5">
                            <PlayCircle className="h-4 w-4" />
                            {Number(item.progressPercent ?? 0) > 0 ? "继续学习" : "开始学习"}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                  还没有开始学习任何课程。
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-foreground">会员权益</h3>
                {access?.hasVip ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      当前会员有效
                    </div>
                    <p className="text-sm text-foreground">{access.vipPlanName ?? "VIP 会员"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {access.vipExpiresAt ? `到期时间：${new Date(access.vipExpiresAt).toLocaleDateString("zh-CN")}` : "当前为长期会员"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-secondary/40 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                      <Crown className="h-4 w-4 text-amber-500" />
                      暂未开通会员
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">开通后可访问会员课程，后续接入真实支付后这里会展示真实权益状态。</p>
                    <Link href="/pricing">
                      <Button size="sm">去开通</Button>
                    </Link>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-foreground">最近订单</h3>
                {commerceOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">还没有订单记录。</p>
                ) : (
                  <div className="space-y-3">
                    {commerceOrders.slice(0, 5).map((order) => (
                      <div key={order.id} className="rounded-xl border border-border px-3 py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="line-clamp-1 text-sm font-medium text-foreground">{order.productSnapshotTitle}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">订单号：{order.orderNo}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {`金额 ¥${((order.amountCents ?? 0) / 100).toFixed(2)} · ${
                            order.status === "paid"
                              ? "已支付"
                              : order.status === "pending"
                                ? "待支付"
                                : order.status === "cancelled"
                                  ? "已取消"
                                  : "已退款"
                          }`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-foreground">我的收藏</h3>
                {favorites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">你还没有收藏课程。</p>
                ) : (
                  <div className="space-y-3">
                    {favorites.slice(0, 6).map((favorite) => (
                      <Link key={favorite.favoriteId} href={`/course/${favorite.course.slug}`}>
                        <div className="cursor-pointer rounded-xl border border-border p-3 transition-colors hover:bg-secondary/40">
                          <div className="mb-1 flex items-center gap-2">
                            <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                            <p className="line-clamp-1 text-sm font-medium text-foreground">{favorite.course.title}</p>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{favorite.course.description ?? "已加入收藏，随时回来继续看。"}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-foreground">最近学习记录</h3>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无最近记录。</p>
                ) : (
                  <div className="space-y-3">
                    {activities.map((activity) =>
                      activity.course ? (
                        <Link key={activity.id} href={`/course/${activity.course.slug}`}>
                          <div className="cursor-pointer rounded-xl bg-secondary/40 px-3 py-3 transition-colors hover:bg-secondary">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">{activity.course.title}</p>
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {activity.chapterTitle ? `学习到：${activity.chapterTitle}` : "更新了课程进度"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{new Date(activity.viewedAt).toLocaleString("zh-CN")}</p>
                          </div>
                        </Link>
                      ) : (
                        <div key={activity.id} className="rounded-xl bg-secondary/40 px-3 py-3">
                          <p className="line-clamp-1 text-sm font-medium text-foreground">课程已删除</p>
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {activity.chapterTitle ? `学习到：${activity.chapterTitle}` : "更新了课程进度"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(activity.viewedAt).toLocaleString("zh-CN")}</p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
