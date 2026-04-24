import { Link, useLocation } from "wouter";
import {
  Bell,
  BookOpen,
  ChevronDown,
  GraduationCap,
  LogIn,
  LogOut,
  Moon,
  Search,
  Settings,
  ShieldAlert,
  Sun,
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
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
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
    typeof window !== "undefined" ? window.location.search : "",
  ).get("category");

  const unreadLabel =
    Number(unreadCount ?? 0) > 0
      ? `\u6d88\u606f\u901a\u77e5\uFF08${Number(unreadCount) > 99 ? "99+" : unreadCount}\uFF09`
      : "\u6d88\u606f\u901a\u77e5";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
      <div className="container">
        <div className="flex h-14 items-center gap-4">
          <Link href="/">
            <div className="shrink-0 cursor-pointer flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground">
                <BookOpen className="h-4 w-4 text-background" />
              </div>
              <span className="text-base font-semibold tracking-tight text-foreground">LearnFlow</span>
            </div>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 overflow-x-auto md:flex">
            <Link href="/">
              <button
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  location === "/" && !selectedCategory
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {"\u5168\u90E8"}
              </button>
            </Link>
            {categories?.slice(0, 5).map((category) => (
              <Link key={category.id} href={`/?category=${category.slug}`}>
                <button
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedCategory === category.slug
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {category.name}
                </button>
              </Link>
            ))}
            {categories && categories.length > 5 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="shrink-0 flex items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground">
                    {"\u66F4\u591A"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {categories.slice(5).map((category) => (
                    <DropdownMenuItem key={category.id} asChild>
                      <Link href={`/?category=${category.slug}`}>{category.name}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <Link href="/pricing">
              <Button
                variant="ghost"
                size="sm"
                className="hidden h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground md:inline-flex"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                {"\u6743\u9650\u8BF4\u660E"}
              </Button>
            </Link>
            {isAuthenticated ? (
              <Link href="/notifications">
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                  {Number(unreadCount ?? 0) > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-foreground px-1 text-center text-[10px] leading-4 text-background">
                      {Number(unreadCount) > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Button>
              </Link>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={onSearchClick}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-secondary text-xs text-foreground">
                        {user.name?.charAt(0)?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {user.name ?? "\u7528\u6237"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email ?? ""}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/me">
                      <GraduationCap className="mr-2 h-3.5 w-3.5" />
                      {"\u6211\u7684\u5B66\u4E60"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/notifications">
                      <Bell className="mr-2 h-3.5 w-3.5" />
                      {unreadLabel}
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" ? (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin">
                          <Settings className="mr-2 h-3.5 w-3.5" />
                          {"\u540E\u53F0\u7BA1\u7406"}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={logout}
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    {"\u9000\u51FA\u767B\u5F55"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  window.location.href = getLoginUrl();
                }}
              >
                <LogIn className="h-3.5 w-3.5" />
                {"\u767B\u5F55"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
