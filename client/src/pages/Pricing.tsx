import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, BookOpen, Crown, Loader2, ShieldCheck, Sparkles, WalletCards, Smartphone } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

function formatPrice(priceCents?: number | null) {
  return `¥${((priceCents ?? 0) / 100).toFixed(2)}`;
}

const providerMeta = {
  alipay: { label: "支付宝", icon: WalletCards },
  wechat: { label: "微信支付", icon: Smartphone },
  mock: { label: "模拟支付", icon: ShieldCheck },
} as const;

export default function Pricing() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.product.list.useQuery({ activeOnly: true });
  const { data: access } = trpc.commerce.myAccess.useQuery(undefined, { enabled: isAuthenticated });
  const { data: gatewayStatus } = trpc.commerce.gatewayStatus.useQuery();

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
      toast.success("购买成功，权益已发放");
    },
    onError: (error) => toast.error(`支付失败：${error.message}`),
  });

  const vipProducts = useMemo(() => (products ?? []).filter((item) => item.type === "vip"), [products]);
  const courseProducts = useMemo(() => (products ?? []).filter((item) => item.type === "course"), [products]);
  const readyRealProviders = useMemo(
    () => (gatewayStatus?.supported ?? []).filter((item) => item.ready && item.provider !== "mock"),
    [gatewayStatus]
  );
  const purchasing = createOrderMutation.isPending || createCheckoutMutation.isPending || payMockMutation.isPending;

  const handleBuy = async (productId: number, provider?: "alipay" | "wechat" | "mock") => {
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
      toast.success(
        selectedProvider === "wechat"
          ? "微信支付二维码已生成，当前页面会自动确认到账结果"
          : "已发起支付宝支付，当前页面会自动确认到账结果"
      );
    } catch (error: any) {
      toast.error(error?.message ?? "购买失败，请重试");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 space-y-8">
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium mb-4">
            <Sparkles className="w-3 h-3" />
            P11 · 支付结果页与到账确认
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-3">会员与课程购买</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            这页已经不再只是模拟支付。当前项目支持服务端发起支付宝网页支付，以及微信 Native 扫码支付，回调仍然走你站内的订单与权益链路。
          </p>
          {access?.hasVip ? (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              当前账号已开通会员
              {access.vipExpiresAt ? ` · 到期时间 ${new Date(access.vipExpiresAt).toLocaleDateString("zh-CN")}` : ""}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {(gatewayStatus?.supported ?? []).map((item) => {
              const Icon = providerMeta[item.provider].icon;
              return (
                <span
                  key={item.provider}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${item.ready ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-secondary text-muted-foreground"}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {providerMeta[item.provider].label}
                  {item.ready ? "已就绪" : `未就绪${item.reason ? ` · ${item.reason}` : ""}`}
                </span>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-semibold text-foreground">会员商品</h2>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-border bg-card p-6 space-y-3">
                  <div className="skeleton h-5 w-1/3 rounded" />
                  <div className="skeleton h-8 w-1/2 rounded" />
                  <div className="skeleton h-16 w-full rounded" />
                </div>
              ))}
            </div>
          ) : vipProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
              还没有上架会员商品，先去后台创建一个 VIP 商品。
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vipProducts.map((product) => {
                const alreadyOwned = Boolean(access?.hasVip);
                return (
                  <div key={product.id} className="rounded-3xl border border-border bg-card p-6 flex flex-col">
                    <div className="inline-flex items-center gap-2 text-xs font-medium rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-3 py-1 w-fit mb-4">
                      <Crown className="w-3.5 h-3.5" />
                      会员权益
                    </div>
                    <h3 className="text-2xl font-semibold text-foreground">{product.title}</h3>
                    <p className="text-3xl font-semibold text-foreground mt-4">{formatPrice(product.priceCents)}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {product.durationDays ? `${product.durationDays} 天会员时长` : "长期会员权益"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-4 leading-relaxed flex-1">
                      {product.description || "开通后可观看所有会员课程，订单支付成功后立即发放会员权益。"}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      {readyRealProviders.map((provider) => {
                        const Icon = providerMeta[provider.provider].icon;
                        return (
                          <Button
                            key={provider.provider}
                            className="gap-2"
                            disabled={alreadyOwned || purchasing}
                            onClick={() => handleBuy(product.id, provider.provider)}
                          >
                            {purchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                            {alreadyOwned ? "当前已开通" : `${providerMeta[provider.provider].label}开通`}
                          </Button>
                        );
                      })}
                      <Button variant="outline" disabled={alreadyOwned || purchasing} onClick={() => handleBuy(product.id, "mock")}>开发模式模拟支付</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-foreground" />
              <h2 className="text-xl font-semibold text-foreground">单课商品</h2>
            </div>
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-1.5">
                去课程页
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
          {courseProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground text-center">
              还没有上架单课商品。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {courseProducts.map((product) => {
                const owned = Boolean(product.courseId && access?.entitledCourseIds?.includes(product.courseId));
                return (
                  <div key={product.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="aspect-[16/10] bg-secondary overflow-hidden">
                      {product.coverUrl || product.course?.coverUrl ? (
                        <img
                          src={product.coverUrl || product.course?.coverUrl || undefined}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-foreground line-clamp-1">{product.title}</h3>
                        <span className="text-sm font-semibold text-foreground">{formatPrice(product.priceCents)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3 min-h-[60px]">
                        {product.description || product.course?.title || "单独购买后获得该课程的观看权限。"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        {readyRealProviders.map((provider) => (
                          <Button key={provider.provider} disabled={owned || purchasing} onClick={() => handleBuy(product.id, provider.provider)}>
                            {owned ? "已拥有" : providerMeta[provider.provider].label}
                          </Button>
                        ))}
                        <Button variant="outline" disabled={owned || purchasing} onClick={() => handleBuy(product.id, "mock")}>{owned ? "已拥有" : "模拟支付"}</Button>
                        {product.course?.slug ? (
                          <Link href={`/course/${product.course.slug}`}>
                            <Button variant="ghost">查看课程</Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
