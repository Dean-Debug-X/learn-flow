import { useEffect, useMemo, useState } from "react";
import { BookOpen, TrendingUp, Users, Sparkles, Search, Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import CourseCard from "@/components/CourseCard";
import AISearchDialog from "@/components/AISearchDialog";

const levelOptions = [
  { value: "all", label: "全部难度" },
  { value: "beginner", label: "入门" },
  { value: "intermediate", label: "进阶" },
  { value: "advanced", label: "高级" },
] as const;

const defaultHomepage = {
  heroBadge: "AI 驱动的学习平台",
  heroTitle: "优雅学习，持续成长",
  heroSubtitle: "把课程内容、学习路径和站点运营配置都收进一个后台里。",
  primaryButtonText: "浏览课程",
  secondaryButtonText: "AI 智能搜索",
  featuredTitle: "优先看看这些精选课程",
  featuredSubtitle: "后台标记为推荐且已发布的课程会优先展示在这里。",
};

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<(typeof levelOptions)[number]["value"]>("all");
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    const keyword = params.get("q");
    const levelParam = params.get("level");
    if (cat) setSelectedCategory(cat);
    if (keyword) setSearch(keyword);
    if (levelParam === "beginner" || levelParam === "intermediate" || levelParam === "advanced") {
      setLevel(levelParam);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategory) params.set("category", selectedCategory);
    if (search.trim()) params.set("q", search.trim());
    if (level !== "all") params.set("level", level);
    const query = params.toString();
    window.history.replaceState({}, "", query ? `/?${query}` : "/");
  }, [level, search, selectedCategory]);

  const { data: homepageConfig } = trpc.site.homepage.useQuery();
  const { data: banners } = trpc.site.bannerList.useQuery({ activeOnly: true });
  const { data: categoriesData } = trpc.category.list.useQuery();
  const { data: featuredData } = trpc.course.list.useQuery({
    status: "published",
    featuredOnly: true,
    limit: 6,
  });
  const { data: coursesData, isLoading } = trpc.course.list.useQuery({
    categorySlug: selectedCategory,
    search: search.trim() || undefined,
    level,
    status: "published",
    limit: 50,
  });

  const config = homepageConfig ?? defaultHomepage;
  const categories = categoriesData ?? [];
  const courses = coursesData?.items ?? [];
  const featuredCourses = useMemo(
    () => (featuredData?.items ?? []).filter((course) => course.status === "published"),
    [featuredData?.items]
  );

  const stats = [
    { icon: BookOpen, label: "精品课程", value: `${coursesData?.total ?? courses.length}+` },
    { icon: TrendingUp, label: "学习分类", value: `${categories.length}+` },
    { icon: Users, label: "推荐课程", value: `${featuredCourses.length}+` },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearchClick={() => setAiOpen(true)} />

      <section className="py-16 md:py-24 text-center">
        <div className="container max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium mb-6">
            <Sparkles className="w-3 h-3" />
            {config.heroBadge}
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 leading-tight whitespace-pre-line">
            {config.heroTitle}
          </h1>
          <p className="text-base text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
            {config.heroSubtitle}
          </p>
          <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
            <Button
              size="lg"
              className="gap-2 rounded-full px-6"
              onClick={() => {
                document.getElementById("course-grid")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <BookOpen className="w-4 h-4" />
              {config.primaryButtonText}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2 rounded-full px-6"
              onClick={() => setAiOpen(true)}
            >
              <Sparkles className="w-4 h-4" />
              {config.secondaryButtonText}
            </Button>
          </div>

          <div className="max-w-2xl mx-auto rounded-3xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索课程名、讲师、标签或分类"
                  className="pl-9 rounded-2xl"
                />
              </div>
              <Button variant="outline" className="rounded-2xl" onClick={() => setAiOpen(true)}>
                让 AI 帮我找
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {levelOptions.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setLevel(item.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    level === item.value
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 mt-10 flex-wrap">
            {stats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-xs">{label}</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {banners && banners.length > 0 ? (
        <section className="container pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {banners.map((banner) => (
              <div key={banner.id} className="relative overflow-hidden rounded-3xl border border-border bg-card min-h-[220px]">
                {banner.imageUrl ? (
                  <img src={banner.imageUrl} alt={banner.title} className="absolute inset-0 w-full h-full object-cover" />
                ) : null}
                <div className={`absolute inset-0 ${banner.imageUrl ? "bg-black/45" : "bg-gradient-to-br from-secondary via-background to-secondary"}`} />
                <div className="relative h-full p-6 md:p-8 flex flex-col justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full bg-background/80 text-foreground mb-3">
                      <Sparkles className="w-3 h-3" />
                      运营 Banner
                    </div>
                    <h2 className={`text-2xl font-semibold ${banner.imageUrl ? "text-white" : "text-foreground"}`}>{banner.title}</h2>
                    {banner.subtitle ? (
                      <p className={`text-sm mt-3 max-w-xl ${banner.imageUrl ? "text-white/85" : "text-muted-foreground"}`}>{banner.subtitle}</p>
                    ) : null}
                  </div>
                  {banner.ctaLink && banner.ctaText ? (
                    <a
                      href={banner.ctaLink}
                      className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {banner.ctaText}
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {featuredCourses.length > 0 ? (
        <section className="container pb-6">
          <div className="rounded-3xl border border-border bg-card p-5 md:p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-1 rounded-full mb-2">
                  <Star className="w-3 h-3" />
                  首页推荐
                </div>
                <h2 className="text-xl font-semibold text-foreground">{config.featuredTitle}</h2>
                <p className="text-sm text-muted-foreground mt-1">{config.featuredSubtitle}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {featuredCourses.map((course, index) => (
                <CourseCard key={course.id} course={course} style={{ animationDelay: `${index * 0.04}s` }} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="sticky top-14 z-40 bg-background/95 backdrop-blur-md border-y border-border">
        <div className="container">
          <div className="flex items-center gap-2 overflow-x-auto py-3 no-scrollbar">
            <button
              onClick={() => setSelectedCategory(undefined)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                !selectedCategory
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
            >
              全部
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.slug)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === cat.slug
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-8" id="course-grid">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">全部课程</h2>
            <p className="text-sm text-muted-foreground mt-1">按分类、难度和关键词筛出适合你的学习内容。</p>
          </div>
          <Button variant="outline" className="rounded-full gap-2" onClick={() => setAiOpen(true)}>
            <Sparkles className="w-4 h-4" />
            AI 推荐课程
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="skeleton w-full" style={{ aspectRatio: "16/10" }} />
                <div className="p-4 space-y-2">
                  <div className="skeleton h-4 w-20 rounded" />
                  <div className="skeleton h-5 w-4/5 rounded" />
                  <div className="skeleton h-4 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card py-20 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">当前筛选条件下还没有课程，换个关键词试试。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {courses.map((course, index) => (
              <CourseCard key={course.id} course={course} style={{ animationDelay: `${index * 0.03}s` }} />
            ))}
          </div>
        )}
      </section>

      <AISearchDialog open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
