import { useMemo, useState } from "react";
import { Loader2, Shield, UserCog } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ADMIN_LEVELS,
  ADMIN_LEVEL_LABELS,
  ADMIN_PERMISSION_LABELS,
  getEffectiveAdminLevel,
  listAdminPermissions,
} from "@shared/adminAccess";
import { confirmDangerousAction } from "@/lib/adminDanger";

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN");
}

export default function AdminAccess() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [keyword, setKeyword] = useState("");
  const { data: users, isLoading } = trpc.adminAccess.users.useQuery({ role: roleFilter, limit: 200 });

  const updateMutation = trpc.adminAccess.updateUser.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.adminAccess.users.invalidate(), utils.auth.me.invalidate()]);
      toast.success("成员权限已更新");
    },
    onError: (error) => toast.error(error.message || "更新失败"),
  });

  const meLevel = getEffectiveAdminLevel(user as any);
  const myPermissions = useMemo(() => listAdminPermissions(user as any), [user]);

  const filteredUsers = useMemo(() => {
    const items = users ?? [];
    if (!keyword.trim()) return items;
    const q = keyword.trim().toLowerCase();
    return items.filter((item: any) => [item.name ?? "", item.email ?? "", item.openId ?? ""].join(" ").toLowerCase().includes(q));
  }, [users, keyword]);

  const updateUserRole = (target: any, nextRole: "user" | "admin", nextLevel?: string | null) => {
    const confirmText = confirmDangerousAction(
      "access.update",
      `即将修改 ${target.email || target.name || `#${target.id}`} 的后台权限。`
    );
    if (!confirmText) return;
    updateMutation.mutate({
      userId: target.id,
      role: nextRole,
      adminLevel: nextRole === "admin" ? ((nextLevel ?? target.adminLevel ?? "support") as any) : null,
      confirmText,
    });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">后台权限中心</h1>
            <p className="text-sm text-muted-foreground mt-1">把后台管理员从“一个 admin 全能”拆成分级角色。敏感改动必须二次确认。</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3 min-w-[260px]">
            <div className="text-xs text-muted-foreground">当前账号</div>
            <div className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
              <Shield className="w-4 h-4" />
              {user?.email ?? user?.name ?? "-"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">级别：{meLevel ? ADMIN_LEVEL_LABELS[meLevel] : "无"}</div>
            <div className="mt-2 text-xs text-muted-foreground line-clamp-3">权限：{myPermissions.map((p) => ADMIN_PERMISSION_LABELS[p]).join("、") || "无"}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ADMIN_LEVELS.map((level) => (
            <div key={level} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserCog className="w-4 h-4" />
                {ADMIN_LEVEL_LABELS[level]}
              </div>
              <div className="space-y-1.5">
                {listAdminPermissions({ role: "admin", adminLevel: level }).map((permission) => (
                  <div key={`${level}-${permission}`} className="text-xs text-muted-foreground">• {ADMIN_PERMISSION_LABELS[permission]}</div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-foreground">成员列表</h2>
              <p className="text-xs text-muted-foreground mt-1">只有 Owner 可以修改后台成员角色。主所有者账号不能被降级。</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索姓名、邮箱、OpenID" className="w-56" />
              <Select value={roleFilter} onValueChange={(value: any) => setRoleFilter(value)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部成员</SelectItem>
                  <SelectItem value="admin">仅管理员</SelectItem>
                  <SelectItem value="user">仅普通用户</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/20 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">成员</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">角色</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">后台级别</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">最近登录</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">创建时间</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((item: any) => {
                    const effectiveLevel = getEffectiveAdminLevel(item as any);
                    const disabled = updateMutation.isPending || meLevel !== "owner" || item.openId === user?.openId;
                    return (
                      <tr key={item.id} className="border-b border-border/60">
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-medium text-foreground">{item.name || "未命名用户"}</div>
                          <div className="text-xs text-muted-foreground mt-1 break-all">{item.email || item.openId}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Select
                            value={item.role}
                            disabled={disabled}
                            onValueChange={(value: any) => updateUserRole(item, value, value === "admin" ? effectiveLevel ?? "support" : null)}
                          >
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">普通用户</SelectItem>
                              <SelectItem value="admin">后台管理员</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {item.role === "admin" ? (
                            <Select
                              value={effectiveLevel ?? "support"}
                              disabled={disabled}
                              onValueChange={(value: any) => updateUserRole(item, "admin", value)}
                            >
                              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ADMIN_LEVELS.map((level) => (
                                  <SelectItem key={level} value={level}>{ADMIN_LEVEL_LABELS[level]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground align-top">{formatDate(item.lastSignedIn)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground align-top">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="text-xs text-muted-foreground">
                            {item.openId === user?.openId ? "当前账号不可直接改自己" : meLevel !== "owner" ? "仅 Owner 可调整" : item.openId === user?.openId ? "-" : "修改后立即生效"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
