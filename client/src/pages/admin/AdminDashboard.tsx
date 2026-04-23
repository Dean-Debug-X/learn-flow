import { BookOpen, GraduationCap, MessageSquare, Users, TrendingUp, Star, Package, ReceiptText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";

export default function AdminDashboard() {
  const { data: stats } = trpc.stats.overview.useQuery();
  const { data: coursesData } = trpc.course.list.useQuery({ status: "all", limit: 5 });
  const { data: comments } = trpc.comment.adminList.useQuery();

  const topCourses = coursesData?.items?.slice(0, 5) ?? [];
  const recentComments = comments?.slice(0, 5) ?? [];

  const statCards = [
    { label: "课程总数", value: stats?.courseCount ?? 0, icon: GraduationCap, color: "#6366f1" },
    { label: "分类数量", value: stats?.categoryCount ?? 0, icon: BookOpen, color: "#0ea5e9" },
    { label: "商品数量", value: (stats as any)?.productCount ?? 0, icon: Package, color: "#f59e0b" },
    { label: "订单总数", value: (stats as any)?.orderCount ?? 0, icon: ReceiptText, color: "#ef4444" },
    { label: "评论总数", value: stats?.commentCount ?? 0, icon: MessageSquare, color: "#8b5cf6" },
    { label: "注册用户", value: stats?.userCount ?? 0, icon: Users, color: "#10b981" },
  ];

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-1">平台数据概览</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Courses */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">最新课程</h3>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            {topCourses.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无课程</p>
            ) : (
              <div className="space-y-3">
                {topCourses.map((course) => (
                  <div key={course.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      {course.coverUrl ? (
                        <img
                          src={course.coverUrl}
                          alt={course.title}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground line-clamp-1">
                        {course.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {course.category && (
                          <span
                            className="text-xs"
                            style={{ color: course.category.color ?? "#6366f1" }}
                          >
                            {course.category.name}
                          </span>
                        )}
                        {course.rating && course.rating > 0 ? (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {course.rating.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        course.status === "published"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {course.status === "published" ? "已发布" : "草稿"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Comments */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">最新评论</h3>
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
            </div>
            {recentComments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无评论</p>
            ) : (
              <div className="space-y-3">
                {recentComments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 text-xs font-medium text-foreground">
                      {comment.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {comment.user?.name ?? "匿名"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          评论了 {(comment as any).course?.title ?? "课程"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {comment.content}
                      </p>
                    </div>
                    {comment.rating && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs text-muted-foreground">{comment.rating}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
