import { Link } from "wouter";
import { Clock, Star, BookOpen, Play, Sparkles, Lock, ShieldCheck, UserCheck } from "lucide-react";

interface CourseCardProps {
  course: {
    id: number;
    title: string;
    slug: string;
    description?: string | null;
    coverUrl?: string | null;
    duration?: number | null;
    level?: string | null;
    rating?: number | null;
    ratingCount?: number | null;
    featured?: boolean | null;
    accessType?: string | null;
    priceCents?: number | null;
    instructor?: string | null;
    viewCount?: number | null;
    category?: { name: string; color?: string | null } | null;
  };
  style?: React.CSSProperties;
}

function formatDuration(seconds: number): string {
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

const accessMeta: Record<string, { label: string; icon: typeof BookOpen }> = {
  free: { label: "免费", icon: BookOpen },
  login: { label: "登录可看", icon: UserCheck },
  vip: { label: "会员", icon: ShieldCheck },
  paid: { label: "单课", icon: Lock },
};

function formatPrice(priceCents?: number | null) {
  if (!priceCents || priceCents <= 0) return null;
  return `¥${(priceCents / 100).toFixed(2)}`;
}

export default function CourseCard({ course, style }: CourseCardProps) {
  const access = accessMeta[course.accessType ?? "free"] ?? accessMeta.free;
  const AccessIcon = access.icon;
  const priceLabel = course.accessType === "paid" ? formatPrice(course.priceCents) : null;

  return (
    <div className="masonry-item animate-fade-in-up" style={style}>
      <Link href={`/course/${course.slug}`}>
        <div className="group rounded-2xl bg-card border border-border overflow-hidden card-hover cursor-pointer">
          <div className="relative overflow-hidden bg-secondary">
            {course.coverUrl ? (
              <img
                src={course.coverUrl}
                alt={course.title}
                className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                style={{ aspectRatio: "16/10" }}
              />
            ) : (
              <div
                className="w-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted"
                style={{ aspectRatio: "16/10" }}
              >
                <BookOpen className="w-10 h-10 text-muted-foreground/40" />
              </div>
            )}
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors duration-300 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-background/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100 shadow-lg">
                <Play className="w-5 h-5 text-foreground fill-foreground ml-0.5" />
              </div>
            </div>
            <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
              {course.level && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-background/90 text-foreground font-medium backdrop-blur-sm">
                  {levelLabels[course.level] ?? course.level}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-background/90 text-foreground font-medium backdrop-blur-sm">
                <AccessIcon className="w-3 h-3" />
                {priceLabel ?? access.label}
              </span>
              {course.featured ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-medium backdrop-blur-sm">
                  <Sparkles className="w-3 h-3" />
                  推荐
                </span>
              ) : null}
            </div>
          </div>

          <div className="p-4">
            {course.category && (
              <div className="mb-2">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${course.category.color ?? "#6366f1"}18`,
                    color: course.category.color ?? "#6366f1",
                  }}
                >
                  {course.category.name}
                </span>
              </div>
            )}
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-2 leading-snug group-hover:text-foreground/80 transition-colors">
              {course.title}
            </h3>
            {course.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                {course.description}
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                {course.duration ? (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(course.duration)}
                  </span>
                ) : null}
                {course.rating && course.rating > 0 ? (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {course.rating.toFixed(1)}
                  </span>
                ) : null}
              </div>
              {course.instructor && (
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {course.instructor}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
