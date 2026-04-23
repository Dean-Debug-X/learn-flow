export const ADMIN_LEVELS = ["support", "editor", "manager", "owner"] as const;
export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export const ADMIN_PERMISSIONS = [
  "dashboard.view",
  "categories.manage",
  "courses.manage",
  "media.manage",
  "comments.moderate",
  "site.manage",
  "products.manage",
  "commerce.view",
  "commerce.manage",
  "notifications.view",
  "system.view",
  "system.manage",
  "access.manage",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminUserLike = {
  role?: string | null;
  adminLevel?: string | null;
  openId?: string | null;
};

export const ADMIN_LEVEL_LABELS: Record<AdminLevel, string> = {
  support: "客服",
  editor: "编辑",
  manager: "经理",
  owner: "所有者",
};

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  "dashboard.view": "查看仪表盘",
  "categories.manage": "管理分类",
  "courses.manage": "管理课程与章节",
  "media.manage": "管理媒体与转码",
  "comments.moderate": "审核评论",
  "site.manage": "管理首页与运营位",
  "products.manage": "管理商品",
  "commerce.view": "查看订单与支付通知",
  "commerce.manage": "执行订单、退款、补发",
  "notifications.view": "查看支付通知中心",
  "system.view": "查看系统配置与审计",
  "system.manage": "修改系统配置与恢复快照",
  "access.manage": "管理后台成员权限",
};

const LEVEL_RANK: Record<AdminLevel, number> = {
  support: 0,
  editor: 1,
  manager: 2,
  owner: 3,
};

const PERMISSIONS_BY_LEVEL: Record<AdminLevel, AdminPermission[]> = {
  support: ["dashboard.view", "comments.moderate", "commerce.view", "notifications.view"],
  editor: ["categories.manage", "courses.manage", "media.manage", "site.manage"],
  manager: ["products.manage", "commerce.manage", "system.view"],
  owner: ["system.manage", "access.manage"],
};

export function normalizeAdminLevel(value?: string | null): AdminLevel | null {
  if (!value) return null;
  return (ADMIN_LEVELS as readonly string[]).includes(value) ? (value as AdminLevel) : null;
}

export function getEffectiveAdminLevel(user?: AdminUserLike | null, ownerOpenId?: string | null): AdminLevel | null {
  if (!user || user.role !== "admin") return null;
  const normalized = normalizeAdminLevel(user.adminLevel);
  if (normalized) return normalized;
  if (ownerOpenId && user.openId && user.openId === ownerOpenId) return "owner";
  return "manager";
}

export function listAdminPermissions(user?: AdminUserLike | null, ownerOpenId?: string | null): AdminPermission[] {
  const level = getEffectiveAdminLevel(user, ownerOpenId);
  if (!level) return [];
  return ADMIN_LEVELS.filter((candidate) => LEVEL_RANK[candidate] <= LEVEL_RANK[level]).flatMap((candidate) => PERMISSIONS_BY_LEVEL[candidate]);
}

export function hasAdminPermission(user: AdminUserLike | null | undefined, permission: AdminPermission, ownerOpenId?: string | null) {
  return listAdminPermissions(user, ownerOpenId).includes(permission);
}

export const DANGEROUS_ACTIONS = [
  "category.delete",
  "course.delete",
  "chapter.delete",
  "media.delete",
  "site.banner.delete",
  "product.delete",
  "commerce.order.markPaid",
  "commerce.order.cancel",
  "commerce.order.refund",
  "system.clear",
  "system.import",
  "system.restore",
  "access.update",
] as const;

export type DangerousActionKey = (typeof DANGEROUS_ACTIONS)[number];

export const DANGEROUS_ACTION_LABELS: Record<DangerousActionKey, string> = {
  "category.delete": "删除分类",
  "course.delete": "删除课程",
  "chapter.delete": "删除章节",
  "media.delete": "删除媒体",
  "site.banner.delete": "删除 Banner",
  "product.delete": "删除商品",
  "commerce.order.markPaid": "手动标记订单支付",
  "commerce.order.cancel": "后台取消订单",
  "commerce.order.refund": "执行退款",
  "system.clear": "清除系统配置覆盖",
  "system.import": "导入系统配置快照",
  "system.restore": "恢复系统配置快照",
  "access.update": "修改后台成员权限",
};

export function getDangerousConfirmPhrase(action: DangerousActionKey) {
  return `CONFIRM ${action}`;
}
