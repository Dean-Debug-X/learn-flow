import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  Clock,
  Star,
  BookOpen,
  Play,
  Lock,
  ChevronLeft,
  User,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  Heart,
  Reply,
  ShieldCheck,
  UserCheck,
  Crown,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import Navbar from "@/components/Navbar";
import AISearchDialog from "@/components/AISearchDialog";
import SecureVideoPlayer from "@/components/SecureVideoPlayer";
import { toast } from "sonner";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const levelLabels: Record<string, string> = {
  beginner: "入门",
  intermediate: "进阶",
  advanced: "高级",
};

const accessLabels: Record<string, string> = {
  free: "免费课程",
  login: "登录可看",
  vip: "会员课程",
  paid: "单课付费",
};

const paymentProviderLabels: Record<string, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  mock: "模拟支付",
};

function formatPrice(priceCents?: number | null) {
  if (!priceCents || priceCents <= 0) return null;
  return `¥${(priceCents / 100).toFixed(2)}`;
}

export default function CourseDetail() {
  const [, navigate] = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const { isAuthenticated, user } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const saveTickRef = useRef<number>(0);
  const hasRecordedViewRef = useRef(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [commentRating, setCommentRating] = useState(5);
  const [replyParentId, setReplyParentId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: course, isLoading: courseLoading } = trpc.course.getBySlug.useQuery(
    { slug: slug! },
    { enabled: !!slug }
  );
  const { data: chapters } = trpc.chapter.listByCourse.useQuery(
    { courseId: course?.id ?? 0 },
    { enabled: !!course?.id }
  );
  const { data: comments, refetch: refetchComments } = trpc.comment.listByCourse.useQuery(
    { courseId: course?.id ?? 0 },
    { enabled: !!course?.id }
  );
  const { data: progress } = trpc.progress.getCourse.useQuery(
    { courseId: course?.id ?? 0 },
    { enabled: !!course?.id && isAuthenticated }
  );
  const { data: favoriteStatus } = trpc.favorite.status.useQuery(
    { courseId: course?.id ?? 0 },
    { enabled: !!course?.id && isAuthenticated }
  );
  const { data: accessSummary } = trpc.commerce.myAccess.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: gatewayStatus } = trpc.commerce.gatewayStatus.useQuery();
  const { data: courseProduct } = trpc.product.byCourse.useQuery(
    { courseId: course?.id ?? 0 },
    { enabled: !!course?.id && course?.accessType === "paid" }
  );
  const { data: vipProducts } = trpc.product.list.useQuery(
    { activeOnly: true, type: "vip" },
    { enabled: course?.accessType === "vip" }
  );

  const recordViewMutation = trpc.course.recordView.useMutation();
  const savePositionMutation = trpc.progress.savePosition.useMutation();
  const completeChapterMutation = trpc.progress.completeChapter.useMutation({
    onSuccess: () => {
      utils.progress.getCourse.invalidate({ courseId: course?.id ?? 0 });
      utils.progress.myOverview.invalidate();
    },
  });
  const favoriteMutation = trpc.favorite.toggle.useMutation({
    onSuccess: (result) => {
      utils.favorite.status.invalidate({ courseId: course?.id ?? 0 });
      utils.progress.myOverview.invalidate();
      utils.favorite.list.invalidate();
      toast.success(result.isFavorite ? "已加入收藏" : "已取消收藏");
    },
    onError: (error) => toast.error(`操作失败：${error.message}`),
  });
  const createOrderMutation = trpc.commerce.createOrder.useMutation();
  const createCheckoutMutation = trpc.commerce.createCheckout.useMutation({
    onError: (error) => toast.error(`发起支付失败：${error.message}`),
  });
  const payMockMutation = trpc.commerce.payMock.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.commerce.myAccess.invalidate(),
        utils.commerce.overview.invalidate(),
        utils.commerce.myOrders.invalidate(),
      ]);
      toast.success("支付成功，课程权限已发放");
    },
    onError: (error) => toast.error(`支付失败：${error.message}`),
  });

  const createCommentMutation = trpc.comment.create.useMutation({
    onSuccess: (result) => {
      setCommentContent("");
      setCommentRating(5);
      setReplyContent("");
      setReplyParentId(null);
      if (result.status === "approved") {
        refetchComments();
        toast.success("评论发布成功");
      } else {
        toast.success("评论已提交，等待审核后显示");
      }
      if (course?.id) {
        utils.course.getBySlug.invalidate({ slug: slug! });
      }
    },
    onError: () => toast.error("评论发布失败，请重试"),
  });

  const activeChapterData = useMemo(
    () => chapters?.find((chapter) => chapter.id === activeChapter) ?? chapters?.[0] ?? null,
    [activeChapter, chapters]
  );

  const commentTree = useMemo(() => {
    const rows = comments ?? [];
    return rows
      .filter((item) => !item.parentId)
      .map((parent) => ({
        ...parent,
        replies: rows.filter((reply) => reply.parentId === parent.id),
      }));
  }, [comments]);

  const trialChapterCount = Number(course?.trialChapterCount ?? 0);
  const isAdmin = user?.role === "admin";
  const hasVipAccess = Boolean(accessSummary?.hasVip);
  const hasPaidCourseAccess = Boolean(course?.id && accessSummary?.entitledCourseIds?.includes(course.id));
  const vipProduct = vipProducts?.[0] ?? null;
  const readyRealProviders = useMemo(
    () => (gatewayStatus?.supported ?? []).filter((item) => item.ready && item.provider !== "mock"),
    [gatewayStatus]
  );
  const canAccessFullCourse = Boolean(
    course && (
      isAdmin ||
      course.accessType === "free" ||
      (course.accessType === "login" && isAuthenticated) ||
      (course.accessType === "vip" && hasVipAccess) ||
      (course.accessType === "paid" && hasPaidCourseAccess)
    )
  );
  const canAccessChapter = (chapterId: number | null | undefined) => {
    const chapterIndex = (chapters ?? []).findIndex((chapter) => chapter.id === chapterId);
    if (chapterIndex < 0) return canAccessFullCourse;
    const chapter = chapters?.[chapterIndex];
    if (!chapter) return canAccessFullCourse;
    return canAccessFullCourse || Boolean(chapter.isFree) || chapterIndex < trialChapterCount;
  };
  const currentVideoUrl = canAccessChapter(activeChapterData?.id)
    ? activeChapterData?.videoUrl ?? (canAccessFullCourse ? course?.videoUrl : undefined)
    : undefined;
  const completedChapterIds = progress?.completedChapterIds ?? [];
  const currentAccessLabel = course?.accessType === "paid" ? formatPrice(course.priceCents) ?? accessLabels.paid : accessLabels[course?.accessType ?? "free"];
  const purchasing = createOrderMutation.isPending || createCheckoutMutation.isPending || payMockMutation.isPending;

  useEffect(() => {
    if (!course?.id || hasRecordedViewRef.current) return;
    recordViewMutation.mutate({ courseId: course.id });
    hasRecordedViewRef.current = true;
  }, [course?.id]);

  useEffect(() => {
    if (!chapters?.length || activeChapter !== null) return;
    if (progress?.lastChapterId && chapters.some((chapter) => chapter.id === progress.lastChapterId) && canAccessChapter(progress.lastChapterId)) {
      setActiveChapter(progress.lastChapterId);
      return;
    }
    const firstUnlocked = chapters.find((chapter) => canAccessChapter(chapter.id));
    setActiveChapter(firstUnlocked?.id ?? chapters[0].id);
  }, [activeChapter, chapters, progress?.lastChapterId, canAccessFullCourse, trialChapterCount]);

  useEffect(() => {
    saveTickRef.current = 0;
  }, [activeChapterData?.id, currentVideoUrl]);

  const persistPosition = (positionSeconds: number) => {
    if (!isAuthenticated || !course?.id) return;
    savePositionMutation.mutate({
      courseId: course.id,
      chapterId: activeChapterData?.id,
      positionSeconds: Math.max(0, Math.round(positionSeconds)),
    });
  };

  const resumePosition = () => {
    if (!videoRef.current || !progress) return;
    const shouldResumeChapter =
      !activeChapterData?.id || progress.lastChapterId === activeChapterData.id || !progress.lastChapterId;
    if (!shouldResumeChapter || progress.lastPositionSeconds <= 0) return;
    try {
      videoRef.current.currentTime = progress.lastPositionSeconds;
    } catch {
      // ignore seek errors
    }
  };

  const handleEnded = () => {
    if (isAuthenticated && course?.id && activeChapterData?.id && canAccessChapter(activeChapterData.id)) {
      completeChapterMutation.mutate({ courseId: course.id, chapterId: activeChapterData.id });
    }
    const currentIndex = chapters?.findIndex((item) => item.id === activeChapterData?.id) ?? -1;
    const nextChapter = currentIndex >= 0 ? chapters?.slice(currentIndex + 1).find((item) => canAccessChapter(item.id)) : undefined;
    if (nextChapter) {
      setActiveChapter(nextChapter.id);
    }
  };


  const handlePurchase = async (productId: number, provider?: "alipay" | "wechat" | "mock") => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    const selectedProvider = provider || (gatewayStatus?.defaultProvider as "alipay" | "wechat" | "mock" | undefined) || "mock";
    try {
      const order = await createOrderMutation.mutateAsync({ productId });
      if (!order?.id) throw new Error("订单创建失败");
      if (selectedProvider === "mock") {
        await payMockMutation.mutateAsync({ orderId: order.id });
        navigate(`/payment/success?orderNo=${encodeURIComponent(order.orderNo)}&provider=mock`);
        return;
      }
      const checkout = await createCheckoutMutation.mutateAsync({
        orderId: order.id,
        provider: selectedProvider,
        channel: selectedProvider === "wechat" ? "native" : "page",
      });
      if (checkout?.launchUrl) {
        window.open(checkout.launchUrl, "_blank", "noopener,noreferrer");
      }
      if (checkout?.statusPageUrl) {
        navigate(checkout.statusPageUrl);
      }
      toast.success(selectedProvider === "wechat" ? "微信支付二维码已生成，当前页面会自动确认到账结果" : "已打开支付页面，当前页面会自动确认到账结果");
    } catch (error: any) {
      toast.error(error?.message ?? "购买失败，请重试");
    }
  };

  const renderPurchaseActions = (productId: number, kind: "vip" | "course", priceText?: string | null) => (
    <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
      {readyRealProviders.map((provider) => (
        <Button
          key={`${kind}-${provider.provider}`}
          size="sm"
          className="gap-1.5"
          disabled={purchasing}
          onClick={() => handlePurchase(productId, provider.provider as "alipay" | "wechat") }
        >
          {purchasing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : provider.provider === "wechat" ? <Crown className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
          {kind === "vip" ? `${paymentProviderLabels[provider.provider]}开通会员` : `${paymentProviderLabels[provider.provider]}购买${priceText ? ` ${priceText}` : ""}`}
        </Button>
      ))}
      <Button size="sm" variant="outline" disabled={purchasing} onClick={() => handlePurchase(productId, "mock")}>
        开发模式模拟支付
      </Button>
    </div>
  );

  if (courseLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar onSearchClick={() => setAiOpen(true)} />
        <div className="container py-8">
          <div className="skeleton h-8 w-48 rounded mb-4" />
          <div className="skeleton w-full rounded-2xl" style={{ aspectRatio: "16/9" }} />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar onSearchClick={() => setAiOpen(true)} />
        <div className="container py-24 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">课程不存在</h2>
          <Link href="/">
            <Button variant="outline" className="mt-4">返回首页</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearchClick={() => setAiOpen(true)} />

      <div className="container py-6">
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <Link href="/">
            <button className="hover:text-foreground transition-colors flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" />
              返回课程列表
            </button>
          </Link>
          {course.category ? (
            <>
              <span>/</span>
              <Link href={`/?category=${course.category.slug}`}>
                <button className="hover:text-foreground transition-colors">{course.category.name}</button>
              </Link>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl overflow-hidden bg-black aspect-video">
              {currentVideoUrl ? (
                <SecureVideoPlayer
                  ref={videoRef}
                  sourceUrl={currentVideoUrl}
                  controls
                  className="w-full h-full"
                  posterUrl={course.coverUrl ?? undefined}
                  onLoadedMetadata={resumePosition}
                  onTimeUpdate={(event) => {
                    const current = Math.floor(event.currentTarget.currentTime);
                    if (current - saveTickRef.current >= 15) {
                      saveTickRef.current = current;
                      persistPosition(current);
                    }
                  }}
                  onPause={(event) => persistPosition(event.currentTarget.currentTime)}
                  onEnded={handleEnded}
                />
              ) : canAccessChapter(activeChapterData?.id) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-white/60">
                    <Play className="w-12 h-12 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">暂无视频</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center px-6">
                  <div className="text-center text-white/80 max-w-md">
                    <Lock className="w-12 h-12 mx-auto mb-3 opacity-70" />
                    <p className="text-base font-medium">当前章节未解锁</p>
                    <p className="text-sm text-white/60 mt-2">
                      {course.accessType === "login"
                        ? "登录后可观看完整课程。"
                        : course.accessType === "vip"
                          ? "当前账号还没有会员权益，可先试看开放章节。"
                          : "当前账号暂未拥有该课程权限，可先试看开放章节。"}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                      {!isAuthenticated ? (
                        <Button size="sm" onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
                      ) : null}
                    </div>
                    {isAuthenticated && course.accessType === "vip" && !hasVipAccess && vipProduct ? renderPurchaseActions(vipProduct.id, "vip") : null}
                    {isAuthenticated && course.accessType === "paid" && !hasPaidCourseAccess && courseProduct ? renderPurchaseActions(courseProduct.id, "course", formatPrice(courseProduct.priceCents)) : null}
                  </div>
                </div>
              )}
            </div>

            {isAuthenticated && progress ? (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">你的学习进度</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progress.completedAt ? "这门课程你已经完成了。" : "暂停或关闭页面时，进度会自动保存。"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{progress.progressPercent}%</span>
                </div>
                <Progress value={progress.progressPercent} />
              </div>
            ) : null}

            {!canAccessFullCourse ? (
              <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  {course.accessType === "login" ? <UserCheck className="w-4 h-4 text-foreground" /> : <ShieldCheck className="w-4 h-4 text-foreground" />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">当前为 {currentAccessLabel}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {course.accessType === "login"
                      ? "登录后即可观看全部章节，目前可先试看开放章节。"
                      : "这门课程需要会员或购买后观看，目前可先试看开放章节。"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {!isAuthenticated ? (
                      <Button size="sm" onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
                    ) : null}
                    {(course.accessType === "vip" || course.accessType === "paid") ? (
                      <Link href="/pricing">
                        <Button size="sm" variant="outline">查看商品页</Button>
                      </Link>
                    ) : null}
                  </div>
                  {isAuthenticated && course.accessType === "vip" && !hasVipAccess && vipProduct ? renderPurchaseActions(vipProduct.id, "vip") : null}
                  {isAuthenticated && course.accessType === "paid" && !hasPaidCourseAccess && courseProduct ? renderPurchaseActions(courseProduct.id, "course", formatPrice(courseProduct.priceCents)) : null}
                </div>
              </div>
            ) : null}

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {course.category ? (
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: `${course.category.color ?? "#6366f1"}18`,
                      color: course.category.color ?? "#6366f1",
                    }}
                  >
                    {course.category.name}
                  </span>
                ) : null}
                {course.level ? (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                    {levelLabels[course.level] ?? course.level}
                  </span>
                ) : null}
                <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                  {currentAccessLabel}
                </span>
                {course.featured ? (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    推荐课程
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-3">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground leading-tight">{course.title}</h1>
                </div>
                <Button
                  variant={favoriteStatus?.isFavorite ? "default" : "outline"}
                  className="gap-1.5"
                  onClick={() => {
                    if (!isAuthenticated) {
                      window.location.href = getLoginUrl();
                      return;
                    }
                    favoriteMutation.mutate({ courseId: course.id });
                  }}
                  disabled={favoriteMutation.isPending}
                >
                  <Heart className={`w-4 h-4 ${favoriteStatus?.isFavorite ? "fill-current" : ""}`} />
                  {favoriteStatus?.isFavorite ? "已收藏" : "收藏课程"}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                {course.instructor ? (
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    {course.instructor}
                  </span>
                ) : null}
                {course.duration ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatDuration(course.duration)}
                  </span>
                ) : null}
                {course.rating && course.rating > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {course.rating.toFixed(1)}
                    {course.ratingCount ? <span className="text-xs">({course.ratingCount} 评价)</span> : null}
                  </span>
                ) : null}
                <span>{course.viewCount ?? 0} 次播放</span>
              </div>

              {course.description ? (
                <div className="bg-secondary/50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">课程简介</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{course.description}</p>
                </div>
              ) : null}
            </div>

            <div>
              <h3 className="text-base font-semibold text-foreground mb-4">
                学员评论
                {comments && comments.length > 0 ? (
                  <span className="text-sm font-normal text-muted-foreground ml-2">({comments.length})</span>
                ) : null}
              </h3>

              {isAuthenticated ? (
                <div className="bg-card border border-border rounded-2xl p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-muted-foreground">评分：</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => setCommentRating(star)} className="transition-transform hover:scale-110">
                          <Star className={`w-5 h-5 transition-colors ${star <= commentRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea value={commentContent} onChange={(event) => setCommentContent(event.target.value)} placeholder="分享你的学习心得..." className="mb-3 resize-none text-sm" rows={3} />
                  <div className="flex justify-between items-center gap-3">
                    <p className="text-xs text-muted-foreground">普通用户评论会先进入审核，审核通过后才会显示。</p>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={!commentContent.trim() || createCommentMutation.isPending}
                      onClick={() => {
                        createCommentMutation.mutate({ courseId: course.id, content: commentContent, rating: commentRating });
                      }}
                    >
                      {createCommentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      发布评论
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-secondary/50 rounded-2xl p-4 mb-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">登录后可发表评论、收藏课程并自动保存学习进度</p>
                  <Button size="sm" onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
                </div>
              )}

              {!comments || comments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">暂无已公开评论，成为第一个留言的人吧</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {commentTree.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs bg-secondary text-foreground">
                            {comment.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{comment.user?.name ?? "匿名用户"}</span>
                            {comment.rating ? (
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: comment.rating }).map((_, index) => (
                                  <Star key={index} className="w-3 h-3 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                            ) : null}
                            <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleDateString("zh-CN")}</span>
                          </div>
                          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                          {isAuthenticated ? (
                            <button
                              className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setReplyParentId(replyParentId === comment.id ? null : comment.id)}
                            >
                              <Reply className="w-3.5 h-3.5" />
                              回复
                            </button>
                          ) : null}

                          {replyParentId === comment.id ? (
                            <div className="mt-3 space-y-3">
                              <Textarea
                                value={replyContent}
                                onChange={(event) => setReplyContent(event.target.value)}
                                rows={3}
                                className="text-sm resize-none"
                                placeholder={`回复 ${comment.user?.name ?? "这位同学"}...`}
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => { setReplyParentId(null); setReplyContent(""); }}>
                                  取消
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={!replyContent.trim() || createCommentMutation.isPending}
                                  onClick={() => {
                                    createCommentMutation.mutate({
                                      courseId: course.id,
                                      content: replyContent,
                                      rating: 5,
                                      parentId: comment.id,
                                    });
                                  }}
                                >
                                  回复评论
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {comment.replies.length > 0 ? (
                            <div className="mt-4 pl-4 border-l border-border space-y-3">
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="rounded-xl bg-secondary/35 p-3">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-sm font-medium text-foreground">{reply.user?.name ?? "匿名用户"}</span>
                                    <span className="text-xs text-muted-foreground">{new Date(reply.createdAt).toLocaleDateString("zh-CN")}</span>
                                  </div>
                                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{reply.content}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-28 space-y-4">
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">课程章节</h3>
                  {chapters ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      共 {chapters.length} 章节{course.duration ? ` · ${formatDuration(course.duration)}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {!chapters || chapters.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-xs text-muted-foreground">暂无章节</p>
                    </div>
                  ) : (
                    chapters.map((chapter, index) => {
                      const isActive = activeChapterData?.id === chapter.id;
                      const isCompleted = completedChapterIds.includes(chapter.id);
                      return (
                        <button
                          key={chapter.id}
                          onClick={() => canAccessChapter(chapter.id) && setActiveChapter(chapter.id)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border last:border-0 ${isActive ? "bg-secondary" : canAccessChapter(chapter.id) ? "hover:bg-secondary/50" : "opacity-80"}`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-medium ${isActive ? "bg-foreground text-background" : isCompleted ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
                            {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <Play className="w-3 h-3 fill-current" /> : canAccessChapter(chapter.id) ? index + 1 : <Lock className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium line-clamp-2 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{chapter.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {chapter.duration ? <p className="text-xs text-muted-foreground">{formatDuration(chapter.duration)}</p> : null}
                              {!canAccessChapter(chapter.id) ? <span className="text-[11px] text-muted-foreground">未解锁</span> : null}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <button onClick={() => setAiOpen(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-colors text-left">
                <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-background" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">AI 学习助手</p>
                  <p className="text-xs text-muted-foreground">有问题？向 AI 提问</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-border mt-12">
        <div className="container py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
                <BookOpen className="w-3.5 h-3.5 text-background" />
              </div>
              <span className="text-sm font-medium text-foreground">LearnFlow</span>
            </div>
            <p className="text-xs text-muted-foreground">© 2024 LearnFlow. 优雅学习，持续成长。</p>
          </div>
        </div>
      </footer>

      <AISearchDialog open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
