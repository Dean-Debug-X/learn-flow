import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Mail, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

function readRedirectTarget() {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect") || "/";
  return redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
}

export default function Login() {
  const redirectTarget = readRedirectTarget();
  const wechatLoginUrl = `/api/auth/wechat/login?redirect=${encodeURIComponent(redirectTarget)}`;
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const { data: availableMethods } = trpc.auth.availableMethods.useQuery();

  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");

  const emailEnabled = useMemo(
    () => Boolean(availableMethods?.email.enabled),
    [availableMethods?.email.enabled],
  );
  const wechatEnabled = useMemo(
    () => Boolean(availableMethods?.wechat.enabled),
    [availableMethods?.wechat.enabled],
  );

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(redirectTarget);
    }
  }, [isAuthenticated, loading, navigate, redirectTarget]);

  const sendEmailCode = trpc.auth.email.sendCode.useMutation({
    onSuccess: (result) => {
      toast.success(
        `\u9a8c\u8bc1\u7801\u5df2\u53d1\u9001\uff0c${result.cooldownSeconds} \u79d2\u540e\u53ef\u91cd\u65b0\u83b7\u53d6`,
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const verifyEmailCode = trpc.auth.email.verifyCode.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("\u90ae\u7bb1\u767b\u5f55\u6210\u529f");
      navigate(redirectTarget);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-10 md:py-16">
        <Card className="w-full max-w-xl border-border/80 shadow-sm">
          <CardHeader className="text-center">
            <CardTitle>\u767b\u5f55 LearnFlow</CardTitle>
            <CardDescription>
              \u5f53\u524d\u4ec5\u4fdd\u7559\u90ae\u7bb1\u9a8c\u8bc1\u7801\u767b\u5f55\u548c\u5fae\u4fe1\u767b\u5f55\u3002
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4" />
                {"\u90ae\u7bb1\u9a8c\u8bc1\u7801\u767b\u5f55"}
              </div>

              {emailEnabled ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email-input">{"\u90ae\u7bb1\u5730\u5740"}</Label>
                    <Input
                      id="email-input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-code">{"\u9a8c\u8bc1\u7801"}</Label>
                    <Input
                      id="email-code"
                      placeholder="\u8f93\u5165 6 \u4f4d\u9a8c\u8bc1\u7801"
                      value={emailCode}
                      onChange={(event) =>
                        setEmailCode(event.target.value.replace(/[^\d]/g, "").slice(0, 8))
                      }
                      inputMode="numeric"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={!email.trim() || sendEmailCode.isPending}
                      onClick={() => sendEmailCode.mutate({ email })}
                    >
                      {sendEmailCode.isPending
                        ? "\u53d1\u9001\u4e2d..."
                        : "\u53d1\u9001\u9a8c\u8bc1\u7801"}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={!email.trim() || emailCode.length < 4 || verifyEmailCode.isPending}
                      onClick={() => verifyEmailCode.mutate({ email, code: emailCode })}
                    >
                      {verifyEmailCode.isPending
                        ? "\u767b\u5f55\u4e2d..."
                        : "\u9a8c\u8bc1\u7801\u767b\u5f55"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  {
                    "\u5f53\u524d\u7ad9\u70b9\u8fd8\u6ca1\u6709\u542f\u7528\u90ae\u7bb1\u9a8c\u8bc1\u7801\u53d1\u9001\uff0c\u8bf7\u5148\u914d\u7f6e\u90ae\u4ef6\u73af\u5883\u53d8\u91cf\u3002"
                  }
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <QrCode className="h-4 w-4" />
                {"\u5fae\u4fe1\u767b\u5f55"}
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                {
                  "\u914d\u7f6e\u5b8c\u6210\u540e\u4f1a\u8df3\u8f6c\u5230\u5fae\u4fe1\u6388\u6743\u9875\uff0c\u6210\u529f\u540e\u81ea\u52a8\u8fd4\u56de\u5f53\u524d\u76ee\u6807\u9875\u9762\u3002"
                }
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={!wechatEnabled}
                onClick={() => {
                  window.location.href = wechatLoginUrl;
                }}
              >
                {wechatEnabled
                  ? "\u4f7f\u7528\u5fae\u4fe1\u767b\u5f55"
                  : "\u5fae\u4fe1\u767b\u5f55\u6682\u672a\u914d\u7f6e"}
              </Button>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              {"\u767b\u5f55\u6210\u529f\u540e\u5c06\u8fd4\u56de"}
              <span className="ml-2 rounded-full bg-secondary px-3 py-1 text-foreground">
                {redirectTarget}
              </span>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              <Link href="/">
                <span className="cursor-pointer text-foreground underline underline-offset-4">
                  {"\u8fd4\u56de\u9996\u9875"}
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
