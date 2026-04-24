import { Link } from "wouter";
import { BookOpen, Crown, ShieldAlert } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

function formatPrice(priceCents?: number | null) {
  return `\u00A5${((priceCents ?? 0) / 100).toFixed(2)}`;
}

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const { data: products, isLoading } = trpc.product.list.useQuery({ activeOnly: true });
  const { data: access } = trpc.commerce.myAccess.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const vipProducts = (products ?? []).filter((item) => item.type === "vip");
  const courseProducts = (products ?? []).filter((item) => item.type === "course");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container space-y-8 py-8">
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="h-3 w-3" />
            {"\u5728\u7ebf\u652f\u4ed8\u5df2\u5173\u95ed"}
          </div>
          <h1 className="mb-3 text-3xl font-semibold text-foreground md:text-4xl">
            {"\u6743\u9650\u8bf4\u660e"}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {
              "\u5f53\u524d\u7ad9\u70b9\u4e0d\u63d0\u4f9b\u5728\u7ebf\u652f\u4ed8\u3002\u9875\u9762\u4ec5\u4fdd\u7559\u5546\u54c1\u4e0e\u6743\u9650\u8bf4\u660e\uff0c\u7528\u4e8e\u5c55\u793a\u8bfe\u7a0b\u8bbf\u95ee\u89c4\u5219\u3002\u5982\u9700\u5f00\u901a\u4f1a\u5458\u6216\u5355\u8bfe\u6743\u9650\uff0c\u53ea\u80fd\u901a\u8fc7\u540e\u53f0\u4eba\u5de5\u5904\u7406\u3002"
            }
          </p>
          {access?.hasVip ? (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Crown className="h-3.5 w-3.5" />
              {"\u5f53\u524d\u8d26\u53f7\u5df2\u62e5\u6709\u4f1a\u5458\u6743\u9650"}
              {access.vipExpiresAt
                ? `\uFF0C\u5230\u671F\u65F6\u95F4 ${new Date(access.vipExpiresAt).toLocaleDateString("zh-CN")}`
                : ""}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {!isAuthenticated ? (
              <Button onClick={() => (window.location.href = getLoginUrl())}>
                {"\u7acb\u5373\u767b\u5f55"}
              </Button>
            ) : (
              <Link href="/me">
                <Button>{"\u67e5\u770b\u6211\u7684\u5b66\u4e60"}</Button>
              </Link>
            )}
            <Link href="/">
              <Button variant="outline">{"\u8fd4\u56de\u8bfe\u7a0b\u9996\u9875"}</Button>
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <h2 className="text-xl font-semibold text-foreground">
              {"\u4f1a\u5458\u5546\u54c1"}
            </h2>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-6">
                  <div className="skeleton h-5 w-1/3 rounded" />
                  <div className="skeleton h-8 w-1/2 rounded" />
                  <div className="skeleton h-16 w-full rounded" />
                </div>
              ))}
            </div>
          ) : vipProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {"\u5f53\u524d\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u4f1a\u5458\u5546\u54c1\u3002"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {vipProducts.map((product) => (
                <div key={product.id} className="rounded-3xl border border-border bg-card p-6">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    <Crown className="h-3.5 w-3.5" />
                    {"\u4ec5\u5c55\u793a\uFF0C\u4E0D\u652F\u6301\u5728\u7EBF\u8D2D\u4E70"}
                  </div>
                  <h3 className="text-2xl font-semibold text-foreground">{product.title}</h3>
                  <p className="mt-4 text-3xl font-semibold text-foreground">
                    {formatPrice(product.priceCents)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {product.durationDays
                      ? `${product.durationDays} \u5929\u4f1a\u5458\u65f6\u957f`
                      : "\u957f\u671f\u4f1a\u5458\u6743\u9650"}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {product.description || "\u4f1a\u5458\u5546\u54c1\u8bf4\u660e\u6682\u672a\u586b\u5199\u3002"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            <h2 className="text-xl font-semibold text-foreground">
              {"\u5355\u8bfe\u5546\u54c1"}
            </h2>
          </div>
          {courseProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {"\u5f53\u524d\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u5355\u8bfe\u5546\u54c1\u3002"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courseProducts.map((product) => (
                <div key={product.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="aspect-[16/10] overflow-hidden bg-secondary">
                    {product.coverUrl || product.course?.coverUrl ? (
                      <img
                        src={product.coverUrl || product.course?.coverUrl || undefined}
                        alt={product.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="line-clamp-1 text-lg font-semibold text-foreground">
                        {product.title}
                      </h3>
                      <span className="text-sm font-semibold text-foreground">
                        {formatPrice(product.priceCents)}
                      </span>
                    </div>
                    <p className="min-h-[60px] line-clamp-3 text-sm text-muted-foreground">
                      {product.description ||
                        product.course?.title ||
                        "\u8bfe\u7a0b\u5546\u54c1\u8bf4\u660e\u6682\u672a\u586b\u5199\u3002"}
                    </p>
                    {product.course?.slug ? (
                      <div className="mt-4">
                        <Link href={`/course/${product.course.slug}`}>
                          <Button variant="outline">{"\u67e5\u770b\u8bfe\u7a0b"}</Button>
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
