import { Link, useLocation } from "wouter";
import {
  BookOpen,
  Search,
  Sun,
  Moon,
  LogIn,
  LogOut,
  ChevronDown,
  Settings,
  GraduationCap,
  Crown,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";

interface NavbarProps {
  onSearchClick?: () => void;
}

export default function Navbar({ onSearchClick }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const { data: categories } = trpc.category.list.useQuery();
  const utils = trpc.useUtils();
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30000, refetchOnWindowFocus: true });

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined" || typeof EventSource === "undefined") return;
    const stream = new EventSource("/api/notifications/stream", { withCredentials: true });
    const refresh = () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.inbox.invalidate();
    };
    stream.addEventListener("snapshot", refresh as EventListener);
    stream.addEventListener("ready", refresh as EventListener);
    stream.onerror = () => {
      stream.close();
    };
    return () => stream.close();
  }, [isAuthenticated, utils]);

  const selectedCategory = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("category");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
      <div className="container">
        <div className="flex h-14 items-center gap-4">
          <Link href="/">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-background" />
              </div>
              <span className="text-base font-semibold text-foreground tracking-tight">LearnFlow</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2 overflow-x-auto no-scrollbar">
            <Link href="/">
              <button
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  location === "/" && !selectedCategory
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                全部
              </button>
            </Link>
            {categories?.slice(0, 5).map((cat) => (
              <Link key={cat.id} href={`/?category=${cat.slug}`}>
                <button
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedCategory === cat.slug
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {cat.name}
                </button>
              </Link>
            ))}
            {categories && categories.length > 5 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                    更多 <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {categories.slice(5).map((cat) => (
                    <DropdownMenuItem key={cat.id} asChild>
                      <Link href={`/?category=${cat.slug}`}>{cat.name}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="hidden md:inline-flex h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Crown className="w-3.5 h-3.5" />
                会员/购买
              </Button>
            </Link>
            {isAuthenticated ? (
              <Link href="/notifications">
                <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                  <Bell className="w-4 h-4" />
                  {Number(unreadCount ?? 0) > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-foreground text-background text-[10px] leading-4 text-center">
                      {Number(unreadCount) > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Button>
              </Link>
            ) : null}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={onSearchClick}>
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-secondary text-foreground">
                        {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{user.name ?? "用户"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email ?? ""}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/me">
                      <GraduationCap className="w-3.5 h-3.5 mr-2" />
                      我的学习
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/notifications">
                      <Bell className="w-3.5 h-3.5 mr-2" />
                      消息通知{Number(unreadCount ?? 0) > 0 ? `（${Number(unreadCount) > 99 ? "99+" : unreadCount}）` : ""}
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" ? (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin">
                          <Settings className="w-3.5 h-3.5 mr-2" />
                          后台管理
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={logout}>
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => (window.location.href = getLoginUrl())}>
                <LogIn className="w-3.5 h-3.5" />
                登录
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
