import { Link, useLocation } from "wouter";
import {
  BookOpen,
  LayoutDashboard,
  GraduationCap,
  Tag,
  MessageSquare,
  ChevronLeft,
  LogOut,
  FolderOpen,
  Sun,
  Moon,
  SlidersHorizontal,
  Package,
  Settings2,
  ReceiptText,
  BellRing,
  ShieldCheck,
  ClipboardList,
  Siren,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/contexts/ThemeContext";
import { ADMIN_LEVEL_LABELS, AdminPermission, getEffectiveAdminLevel, hasAdminPermission } from "@shared/adminAccess";

const navItems: Array<{ href: string; label: string; icon: any; exact?: boolean; permission: AdminPermission }> = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard, exact: true, permission: "dashboard.view" },
  { href: "/admin/courses", label: "课程管理", icon: GraduationCap, permission: "courses.manage" },
  { href: "/admin/media", label: "媒体中心", icon: FolderOpen, permission: "media.manage" },
  { href: "/admin/products", label: "商品管理", icon: Package, permission: "products.manage" },
  { href: "/admin/orders", label: "订单管理", icon: ReceiptText, permission: "commerce.view" },
  { href: "/admin/payment-notifications", label: "支付通知", icon: BellRing, permission: "notifications.view" },
  { href: "/admin/categories", label: "分类管理", icon: Tag, permission: "categories.manage" },
  { href: "/admin/comments", label: "评论管理", icon: MessageSquare, permission: "comments.moderate" },
  { href: "/admin/site", label: "运营配置", icon: SlidersHorizontal, permission: "site.manage" },
  { href: "/admin/system", label: "系统配置", icon: Settings2, permission: "system.view" },
  { href: "/admin/audit", label: "操作审计", icon: ClipboardList, permission: "system.view" },
  { href: "/admin/audit-alerts", label: "审计告警", icon: Siren, permission: "system.view" },
  { href: "/admin/risk", label: "风控面板", icon: ShieldAlert, permission: "system.view" },
  { href: "/admin/access", label: "权限中心", icon: ShieldCheck, permission: "access.manage" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const adminLevel = getEffectiveAdminLevel(user as any);
  const visibleNavItems = navItems.filter((item) => hasAdminPermission(user as any, item.permission));
  const matchedRoute = [...navItems].sort((a, b) => b.href.length - a.href.length).find((item) => item.exact ? location === item.href : location.startsWith(item.href));
  const hasRoutePermission = matchedRoute ? hasAdminPermission(user as any, matchedRoute.permission) : true;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">请先登录</h2>
          <Button onClick={() => (window.location.href = getLoginUrl())}>立即登录</Button>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">无访问权限</h2>
          <p className="text-sm text-muted-foreground mb-4">仅管理员可访问后台</p>
          <Link href="/">
            <Button variant="outline">返回首页</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!hasRoutePermission) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">权限不足</h2>
          <p className="text-sm text-muted-foreground mb-4">当前账号级别为 {adminLevel ? ADMIN_LEVEL_LABELS[adminLevel] : "未设置"}，不能访问这个后台页面。</p>
          <Link href="/admin">
            <Button variant="outline">返回后台首页</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <Link href="/">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-background" />
              </div>
              <span className="text-sm font-semibold text-foreground">LearnFlow</span>
            </div>
          </Link>
          <p className="text-xs text-muted-foreground mt-1 ml-9">后台管理 · {adminLevel ? ADMIN_LEVEL_LABELS[adminLevel] : "管理员"}</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNavItems.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-2">
          <Link href="/">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <ChevronLeft className="w-4 h-4" />
              返回前台
            </div>
          </Link>
          <div className="flex items-center gap-2 px-3 py-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-secondary text-foreground">
                {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground truncate">{user?.name ?? "管理员"}</div>
              <div className="text-[11px] text-muted-foreground/80 truncate">{adminLevel ? ADMIN_LEVEL_LABELS[adminLevel] : "后台成员"}</div>
            </div>
            <button onClick={toggleTheme} className="text-muted-foreground hover:text-foreground transition-colors">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button onClick={logout} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
