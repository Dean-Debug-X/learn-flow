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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type LoginMethod = "phone" | "email";

function readRedirectTarget() {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect") || "/";
  return redirect.startsWith("/") && !redirect.startsWith("//")
    ? redirect
    : "/";
}

export default function Login() {
  const redirectTarget = readRedirectTarget();
  const wechatLoginUrl = `/api/auth/wechat/login?redirect=${encodeURIComponent(
    redirectTarget
  )}`;
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  const { data: availableMethods } = trpc.auth.availableMethods.useQuery();

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");

  const methodTabs = useMemo(() => {
    const methods: LoginMethod[] = [];
    if (availableMethods?.phone.enabled) methods.push("phone");
    if (availableMethods?.email.enabled) methods.push("email");
    return methods;
  }, [availableMethods?.email.enabled, availableMethods?.phone.enabled]);

  const defaultTab = methodTabs[0] ?? "phone";
  const [tab, setTab] = useState<LoginMethod>(defaultTab);

  useEffect(() => {
    if (methodTabs.length > 0 && !methodTabs.includes(tab)) {
      setTab(methodTabs[0]);
    }
  }, [methodTabs, tab]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(redirectTarget);
    }
  }, [isAuthenticated, loading, navigate, redirectTarget]);

  const sendPhoneCode = trpc.auth.phone.sendCode.useMutation({
    onSuccess: (result) => {
      toast.success(`验证码已发送，${result.cooldownSeconds} 秒后可重试`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const verifyPhoneCode = trpc.auth.phone.verifyCode.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("手机号登录成功");
      navigate(redirectTarget);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const sendEmailCode = trpc.auth.email.sendCode.useMutation({
    onSuccess: (result) => {
      toast.success(`验证码已发送，${result.cooldownSeconds} 秒后可重试`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const verifyEmailCode = trpc.auth.email.verifyCode.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("邮箱登录成功");
      navigate(redirectTarget);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-10 md:py-16">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-border bg-gradient-to-br from-secondary/70 via-background to-secondary/30 p-8 md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              统一账号登录
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              使用手机号、邮箱或微信进入 LearnFlow
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
              登录系统已经升级为多身份模型。现在可以使用手机号验证码、邮箱验证码、
              微信扫码和旧版 OAuth 入口登录，登录成功后会自动回到当前目标页面。
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card/80 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageSquare className="h-4 w-4" />
                  手机号验证码
                </div>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  面向国内用户的快速登录方式。开发环境可用日志发码，生产环境可接腾讯云短信。
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Mail className="h-4 w-4" />
                  邮箱验证码
                </div>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  适合企业培训和通知触达场景，也为后续账号绑定和 magic link 打底。
                </p>
              </div>
            </div>
            <div className="mt-8 text-sm text-muted-foreground">
              返回目标页：
              <span className="ml-2 rounded-full bg-background px-3 py-1 text-xs font-medium text-foreground">
                {redirectTarget}
              </span>
            </div>
          </section>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>登录你的账号</CardTitle>
              <CardDescription>
                验证码默认 10 分钟内有效，登录成功后会回到原页面。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {methodTabs.length > 0 ? (
                <Tabs
                  value={tab}
                  onValueChange={(value) => setTab(value as LoginMethod)}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="phone"
                      disabled={!availableMethods?.phone.enabled}
                    >
                      手机号
                    </TabsTrigger>
                    <TabsTrigger
                      value="email"
                      disabled={!availableMethods?.email.enabled}
                    >
                      邮箱
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="phone" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone-input">手机号</Label>
                      <Input
                        id="phone-input"
                        placeholder="例如 13800138000"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        inputMode="tel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone-code">验证码</Label>
                      <Input
                        id="phone-code"
                        placeholder="输入 6 位验证码"
                        value={phoneCode}
                        onChange={(event) =>
                          setPhoneCode(
                            event.target.value.replace(/[^\d]/g, "").slice(0, 8)
                          )
                        }
                        inputMode="numeric"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        disabled={!phone.trim() || sendPhoneCode.isPending}
                        onClick={() => sendPhoneCode.mutate({ phone })}
                      >
                        {sendPhoneCode.isPending ? "发送中..." : "发送验证码"}
                      </Button>
                      <Button
                        type="button"
                        className="flex-1"
                        disabled={
                          !phone.trim() ||
                          phoneCode.length < 4 ||
                          verifyPhoneCode.isPending
                        }
                        onClick={() =>
                          verifyPhoneCode.mutate({ phone, code: phoneCode })
                        }
                      >
                        {verifyPhoneCode.isPending ? "登录中..." : "验证码登录"}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="email" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-input">邮箱地址</Label>
                      <Input
                        id="email-input"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        type="email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-code">验证码</Label>
                      <Input
                        id="email-code"
                        placeholder="输入 6 位验证码"
                        value={emailCode}
                        onChange={(event) =>
                          setEmailCode(
                            event.target.value.replace(/[^\d]/g, "").slice(0, 8)
                          )
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
                        {sendEmailCode.isPending ? "发送中..." : "发送验证码"}
                      </Button>
                      <Button
                        type="button"
                        className="flex-1"
                        disabled={
                          !email.trim() ||
                          emailCode.length < 4 ||
                          verifyEmailCode.isPending
                        }
                        onClick={() =>
                          verifyEmailCode.mutate({ email, code: emailCode })
                        }
                      >
                        {verifyEmailCode.isPending ? "登录中..." : "验证码登录"}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  当前站点还没有启用验证码登录。你可以先使用下面的旧版 OAuth
                  入口，或者先配置邮件 / 短信环境变量。
                </div>
              )}

              {availableMethods?.wechat.enabled ? (
                <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      微信扫码登录
                    </p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      配置完成后会跳转到微信授权页，并在回调成功后自动返回当前目标页。
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      window.location.href = wechatLoginUrl;
                    }}
                  >
                    使用微信登录
                  </Button>
                </div>
              ) : null}

              {availableMethods?.legacyOAuth.enabled ? (
                <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      旧版 OAuth 登录
                    </p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      适合你当前已经接入的统一 OAuth 服务，作为迁移期间的兼容入口继续保留。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      window.location.href = "/api/oauth/login";
                    }}
                  >
                    使用现有 OAuth 登录
                  </Button>
                </div>
              ) : null}

              <div className="text-center text-xs text-muted-foreground">
                {availableMethods?.wechat.enabled
                  ? "微信登录已启用。"
                  : "还没有启用微信登录。"}{" "}
                <Link href="/">
                  <span className="ml-1 cursor-pointer text-foreground underline underline-offset-4">
                    先返回首页看看
                  </span>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
