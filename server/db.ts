import { createHash } from "node:crypto";
import { and, asc, desc, eq, like, or, sql, isNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { alias } from "drizzle-orm/mysql-core";
import {
  InsertUser,
  userIdentities,
  users,
  categories,
  courses,
  chapters,
  comments,
  mediaAssets,
  userCourseProgress,
  userChapterProgress,
  userLearningHistory,
  userFavorites,
  siteSettings,
  systemSettings,
  systemConfigSnapshots,
  systemSettingAuditLogs,
  adminActionAuditLogs,
  adminAlertNotifications,
  adminRiskIncidents,
  adminRiskPlaybooks,
  adminRiskAutomationRules,
  adminRiskRuleExecutions,
  adminRiskSlaPolicies,
  adminRiskOncallAssignments,
  homepageBanners,
  InsertCategory,
  InsertCourse,
  InsertChapter,
  InsertComment,
  InsertMediaAsset,
  InsertHomepageBanner,
  products,
  orders,
  paymentCallbacks,
  paymentNotifications,
  userNotifications,
  emailDeliveries,
  paymentSessions,
  userSubscriptions,
  userEntitlements,
  transcodeJobs,
  InsertProduct,
  InsertPaymentSession,
  InsertTranscodeJob,
} from "../drizzle/schema.js";
import { ENV, refreshEnvFromSystemOverrides } from "./_core/env.js";
import { dispatchPaymentNotificationDelivery } from "./paymentNotifications.js";
import { dispatchEmailDelivery, resolveEmailProvider } from "./emailNotifications.js";
import { dispatchAdminAlertDelivery } from "./adminAlertNotifications.js";
import { SYSTEM_SETTING_DEFINITIONS, SYSTEM_SETTING_MAP, serializeSystemSettingOverview, maskSettingValue } from "./systemConfigCatalog.js";
import { AdminLevel, getEffectiveAdminLevel, normalizeAdminLevel } from "../shared/adminAccess.js";

let _db: ReturnType<typeof drizzle> | null = null;
const ownerUserAlias = alias(users, "owner_user");

function baseCourseSelect() {
  return {
    id: courses.id,
    title: courses.title,
    slug: courses.slug,
    description: courses.description,
    coverUrl: courses.coverUrl,
    videoUrl: courses.videoUrl,
    categoryId: courses.categoryId,
    duration: courses.duration,
    level: courses.level,
    status: courses.status,
    accessType: courses.accessType,
    trialChapterCount: courses.trialChapterCount,
    priceCents: courses.priceCents,
    featured: courses.featured,
    featuredOrder: courses.featuredOrder,
    viewCount: courses.viewCount,
    rating: courses.rating,
    ratingCount: courses.ratingCount,
    instructor: courses.instructor,
    tags: courses.tags,
    publishedAt: courses.publishedAt,
    createdAt: courses.createdAt,
    updatedAt: courses.updatedAt,
    categoryRefId: categories.id,
    categoryName: categories.name,
    categorySlug: categories.slug,
    categoryColor: categories.color,
  };
}

function mapCourseRow<T extends ReturnType<typeof baseCourseSelect> extends infer _R ? Record<string, any> : never>(row: T) {
  const { categoryRefId, categoryName, categorySlug, categoryColor, ...rest } = row;
  return {
    ...rest,
    category: categoryRefId
      ? {
          id: categoryRefId,
          name: categoryName,
          slug: categorySlug,
          color: categoryColor,
        }
      : null,
  };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

type AdminActionAuditStatus = "success" | "failed" | "blocked";

type AdminActionAuditPayload = {
  actorUserId?: number | null;
  actorRole?: string | null;
  actorAdminLevel?: string | null;
  actionType: string;
  actionLabel: string;
  actionStatus?: AdminActionAuditStatus;
  resourceType?: string | null;
  resourceId?: string | number | null;
  resourceLabel?: string | null;
  targetUserId?: number | null;
  relatedOrderId?: number | null;
  snapshotId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
};

export async function appendAdminActionAuditLog(input: AdminActionAuditPayload) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(adminActionAuditLogs).values({
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    actorAdminLevel: input.actorAdminLevel ?? null,
    actionType: input.actionType,
    actionLabel: input.actionLabel,
    actionStatus: input.actionStatus ?? "success",
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId === null || input.resourceId === undefined ? null : String(input.resourceId),
    resourceLabel: input.resourceLabel ?? null,
    targetUserId: input.targetUserId ?? null,
    relatedOrderId: input.relatedOrderId ?? null,
    snapshotId: input.snapshotId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ? String(input.userAgent).slice(0, 255) : null,
    metadata: stringifyJson(input.metadata),
  });
  const [row] = await db.select().from(adminActionAuditLogs).orderBy(desc(adminActionAuditLogs.id)).limit(1);
  if (row) {
    try {
      await emitAdminAlertsForAudit(row.id);
    } catch (error) {
      console.error("[AdminAlert] Failed to emit audit alerts", error);
    }
  }
  return row ?? null;
}

export async function listAdminActionAuditLogs(opts: {
  limit?: number;
  actionType?: string;
  resourceType?: string;
  actorUserId?: number;
  actionStatus?: AdminActionAuditStatus | "all";
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.max(1, Math.min(Number(opts.limit ?? 100), 300));
  const conditions = [] as any[];
  if (opts.actionType) conditions.push(eq(adminActionAuditLogs.actionType, opts.actionType));
  if (opts.resourceType) conditions.push(eq(adminActionAuditLogs.resourceType, opts.resourceType));
  if (opts.actorUserId) conditions.push(eq(adminActionAuditLogs.actorUserId, opts.actorUserId));
  if (opts.actionStatus && opts.actionStatus !== "all") conditions.push(eq(adminActionAuditLogs.actionStatus, opts.actionStatus));
  const rows = await db.select().from(adminActionAuditLogs).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(adminActionAuditLogs.id)).limit(limit);
  const userIds = Array.from(new Set(rows.flatMap((row) => [row.actorUserId, row.targetUserId]).filter(Boolean) as number[]));
  const userMap = new Map<number, { id: number; name: string | null; email: string | null; openId: string }>();
  if (userIds.length) {
    const userRows = await db.select({ id: users.id, name: users.name, email: users.email, openId: users.openId }).from(users).where(inArray(users.id, userIds));
    for (const user of userRows) userMap.set(user.id, user);
  }
  return rows.map((row) => ({
    ...row,
    metadata: parseJsonText(row.metadata),
    actorUser: row.actorUserId ? userMap.get(row.actorUserId) ?? null : null,
    targetUser: row.targetUserId ? userMap.get(row.targetUserId) ?? null : null,
  }));
}

export async function getAdminActionAuditOverview() {
  const db = await getDb();
  if (!db) {
    return {
      total: 0,
      last24h: 0,
      last7d: 0,
      failures: 0,
      blocked: 0,
      topActions: [] as Array<{ actionType: string; count: number }>,
    };
  }
  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(adminActionAuditLogs);
  const [last24hRow] = await db.select({ count: sql<number>`count(*)` }).from(adminActionAuditLogs).where(sql`${adminActionAuditLogs.createdAt} >= date_sub(now(), interval 1 day)`);
  const [last7dRow] = await db.select({ count: sql<number>`count(*)` }).from(adminActionAuditLogs).where(sql`${adminActionAuditLogs.createdAt} >= date_sub(now(), interval 7 day)`);
  const [failuresRow] = await db.select({ count: sql<number>`count(*)` }).from(adminActionAuditLogs).where(eq(adminActionAuditLogs.actionStatus, "failed"));
  const [blockedRow] = await db.select({ count: sql<number>`count(*)` }).from(adminActionAuditLogs).where(eq(adminActionAuditLogs.actionStatus, "blocked"));
  const topActions = await db
    .select({ actionType: adminActionAuditLogs.actionType, count: sql<number>`count(*)` })
    .from(adminActionAuditLogs)
    .groupBy(adminActionAuditLogs.actionType)
    .orderBy(desc(sql<number>`count(*)`), asc(adminActionAuditLogs.actionType))
    .limit(8);
  return {
    total: Number(totalRow?.count ?? 0),
    last24h: Number(last24hRow?.count ?? 0),
    last7d: Number(last7dRow?.count ?? 0),
    failures: Number(failuresRow?.count ?? 0),
    blocked: Number(blockedRow?.count ?? 0),
    topActions: topActions.map((item) => ({ actionType: item.actionType, count: Number(item.count ?? 0) })),
  };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  const normalizedAdminLevel = normalizeAdminLevel((user as InsertUser & { adminLevel?: string | null }).adminLevel ?? null);
  if (normalizedAdminLevel) {
    values.adminLevel = normalizedAdminLevel;
    updateSet.adminLevel = normalizedAdminLevel;
  } else if (user.openId === ENV.ownerOpenId && (values.role === "admin" || updateSet.role === "admin")) {
    values.adminLevel = "owner";
    updateSet.adminLevel = "owner";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function listUserIdentitiesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: userIdentities.id,
      provider: userIdentities.provider,
      providerUserId: userIdentities.providerUserId,
      providerUnionId: userIdentities.providerUnionId,
      displayName: userIdentities.displayName,
      avatarUrl: userIdentities.avatarUrl,
      email: userIdentities.email,
      phone: userIdentities.phone,
      verifiedAt: userIdentities.verifiedAt,
      lastUsedAt: userIdentities.lastUsedAt,
      createdAt: userIdentities.createdAt,
      updatedAt: userIdentities.updatedAt,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))
    .orderBy(desc(userIdentities.lastUsedAt), desc(userIdentities.createdAt));
}

export async function listUserAccessAccounts(opts?: { role?: "user" | "admin" | "all"; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.role && opts.role !== "all") filters.push(eq(users.role, opts.role));
  const rows = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      adminLevel: users.adminLevel,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.lastSignedIn), desc(users.id))
    .limit(opts?.limit ?? 200);
  return rows;
}

export async function updateUserAdminAccess(input: {
  userId: number;
  role: "user" | "admin";
  adminLevel?: AdminLevel | null;
  updatedBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const dbConn = db;

  const current = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const target = current[0];
  if (!target) throw new Error("User not found");

  if (target.openId === ENV.ownerOpenId) {
    if (input.role !== "admin" || (input.adminLevel && input.adminLevel !== "owner")) {
      throw new Error("Primary owner account cannot be demoted or reassigned");
    }
  }

  const nextRole = input.role;
  const nextAdminLevel = nextRole === "admin" ? (input.adminLevel ?? (target.openId === ENV.ownerOpenId ? "owner" : normalizeAdminLevel(target.adminLevel) ?? "support")) : null;

  await db
    .update(users)
    .set({
      role: nextRole,
      adminLevel: nextAdminLevel,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));

  const updated = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  return updated[0] ?? null;
}

export async function getCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).orderBy(categories.sortOrder, categories.name);
}

export async function getCategoryBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return result[0] ?? null;
}

export async function createCategory(data: Omit<InsertCategory, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(categories).values(data);
  const result = await db.select().from(categories).where(eq(categories.slug, data.slug)).limit(1);
  return result[0];
}

export async function updateCategory(id: number, data: Partial<InsertCategory>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(categories).set(data).where(eq(categories.id, id));
  const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return result[0];
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(categories).where(eq(categories.id, id));
  return { success: true };
}

export async function getCourses(opts: {
  categorySlug?: string;
  search?: string;
  level?: "beginner" | "intermediate" | "advanced" | "all";
  featuredOnly?: boolean;
  status?: "draft" | "published" | "all";
  page?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const {
    categorySlug,
    search,
    level = "all",
    featuredOnly = false,
    status = "published",
    page = 1,
    limit = 20,
  } = opts;
  const conditions = [] as any[];

  if (status !== "all") {
    conditions.push(eq(courses.status, status));
  }
  if (level !== "all") {
    conditions.push(eq(courses.level, level));
  }
  if (featuredOnly) {
    conditions.push(eq(courses.featured, true));
  }
  if (search) {
    conditions.push(
      or(
        like(courses.title, `%${search}%`),
        like(courses.description, `%${search}%`),
        like(courses.instructor, `%${search}%`),
        like(courses.tags, `%${search}%`),
        like(categories.name, `%${search}%`)
      )
    );
  }

  if (categorySlug) {
    const cat = await getCategoryBySlug(categorySlug);
    if (!cat) return { items: [], total: 0 };
    conditions.push(eq(courses.categoryId, cat.id));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(courses)
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(whereClause);

  const items = await db
    .select(baseCourseSelect())
    .from(courses)
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(whereClause)
    .orderBy(desc(courses.featured), asc(courses.featuredOrder), desc(courses.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return { items: items.map((item) => mapCourseRow(item)), total: Number(countRow?.count ?? 0) };
}

export async function getCourseBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select(baseCourseSelect())
    .from(courses)
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.slug, slug))
    .limit(1);
  return result[0] ? mapCourseRow(result[0]) : null;
}

export async function getCourseById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select(baseCourseSelect())
    .from(courses)
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.id, id))
    .limit(1);
  return result[0] ? mapCourseRow(result[0]) : null;
}

export async function createCourse(data: Omit<InsertCourse, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const values = {
    ...data,
    publishedAt: data.status === "published" ? data.publishedAt ?? new Date() : data.publishedAt,
  };
  await db.insert(courses).values(values);
  return getCourseBySlug(data.slug);
}

export async function updateCourse(id: number, data: Partial<InsertCourse>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const nextData = {
    ...data,
    ...(data.status === "published" && data.publishedAt === undefined ? { publishedAt: new Date() } : {}),
  };
  await db.update(courses).set(nextData).where(eq(courses.id, id));
  return getCourseById(id);
}

export async function deleteCourse(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(courses).where(eq(courses.id, id));
  return { success: true };
}

export async function incrementCourseView(courseId: number) {
  const db = await getDb();
  if (!db) return { success: true };
  await db
    .update(courses)
    .set({ viewCount: sql`${courses.viewCount} + 1` as any })
    .where(eq(courses.id, courseId));
  return { success: true };
}

export async function searchCoursesByText(keyword: string) {
  const db = await getDb();
  if (!db) return [];
  const words = keyword.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const conditions = words.map((word) =>
    or(
      like(courses.title, `%${word}%`),
      like(courses.description, `%${word}%`),
      like(courses.instructor, `%${word}%`),
      like(courses.tags, `%${word}%`),
      like(categories.name, `%${word}%`)
    )
  );
  const whereClause = and(eq(courses.status, "published"), or(...conditions));
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverUrl: courses.coverUrl,
      duration: courses.duration,
      level: courses.level,
      accessType: courses.accessType,
      priceCents: courses.priceCents,
      featured: courses.featured,
      rating: courses.rating,
      instructor: courses.instructor,
      categoryRefId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(courses)
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(whereClause)
    .orderBy(desc(courses.featured), asc(courses.featuredOrder), desc(courses.rating), desc(courses.viewCount), desc(courses.createdAt))
    .limit(8)
    .then((rows) =>
      rows.map(({ categoryRefId, categoryName, categoryColor, ...rest }) => ({
        ...rest,
        category: categoryRefId
          ? {
              id: categoryRefId,
              name: categoryName,
              color: categoryColor,
            }
          : null,
      }))
    );
}

export async function getChaptersByCourseId(courseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.courseId, courseId))
    .orderBy(chapters.sortOrder, chapters.id);
}

export async function createChapter(data: Omit<InsertChapter, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(chapters).values(data);
  const result = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.courseId, data.courseId), eq(chapters.title, data.title)))
    .orderBy(desc(chapters.id))
    .limit(1);
  return result[0];
}

export async function updateChapter(id: number, data: Partial<InsertChapter>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(chapters).set(data).where(eq(chapters.id, id));
  const result = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
  return result[0];
}

export async function reorderChapters(courseId: number, items: Array<{ id: number; sortOrder: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await Promise.all(
    items.map((item) =>
      db
        .update(chapters)
        .set({ sortOrder: item.sortOrder })
        .where(and(eq(chapters.id, item.id), eq(chapters.courseId, courseId)))
    )
  );
  return getChaptersByCourseId(courseId);
}

export async function deleteChapter(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(chapters).where(eq(chapters.id, id));
  return { success: true };
}

async function recalculateCourseRating(courseId: number) {
  const db = await getDb();
  if (!db) return;
  const [stats] = await db
    .select({
      average: sql<number>`coalesce(avg(${comments.rating}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(comments)
    .where(
      and(
        eq(comments.courseId, courseId),
        isNull(comments.parentId),
        eq(comments.status, "approved")
      )
    );

  await db
    .update(courses)
    .set({
      rating: Number(stats?.average ?? 0),
      ratingCount: Number(stats?.count ?? 0),
    })
    .where(eq(courses.id, courseId));
}

export async function getCommentsByCourseId(courseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: comments.id,
      courseId: comments.courseId,
      userId: comments.userId,
      content: comments.content,
      rating: comments.rating,
      parentId: comments.parentId,
      status: comments.status,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.courseId, courseId), eq(comments.status, "approved")))
    .orderBy(desc(comments.createdAt));
}

export async function createComment(data: Omit<InsertComment, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(comments).values(data);
  if ((data.status ?? "pending") === "approved") {
    await recalculateCourseRating(data.courseId);
  }
  const result = await db
    .select({
      id: comments.id,
      courseId: comments.courseId,
      userId: comments.userId,
      content: comments.content,
      rating: comments.rating,
      parentId: comments.parentId,
      status: comments.status,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(and(eq(comments.courseId, data.courseId), eq(comments.userId, data.userId)))
    .orderBy(desc(comments.createdAt))
    .limit(1);
  return result[0];
}

export async function deleteComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  await db.delete(comments).where(eq(comments.id, id));
  if (comment) {
    await recalculateCourseRating(comment.courseId);
  }
  return { success: true };
}

export async function updateCommentStatus(id: number, status: "pending" | "approved" | "rejected") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  await db.update(comments).set({ status }).where(eq(comments.id, id));
  if (comment) {
    await recalculateCourseRating(comment.courseId);
  }
  const [updated] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return updated;
}

export async function getAllComments(opts?: { status?: "pending" | "approved" | "rejected" | "all" }) {
  const db = await getDb();
  if (!db) return [];
  const status = opts?.status ?? "all";
  const whereClause = status === "all" ? undefined : eq(comments.status, status);
  return db
    .select({
      id: comments.id,
      courseId: comments.courseId,
      userId: comments.userId,
      content: comments.content,
      rating: comments.rating,
      parentId: comments.parentId,
      status: comments.status,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
      },
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .leftJoin(courses, eq(comments.courseId, courses.id))
    .where(whereClause)
    .orderBy(desc(comments.createdAt));
}

export async function createMediaAsset(data: Omit<InsertMediaAsset, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(mediaAssets).values(data);
  const result = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.id)).limit(1);
  return result[0];
}

export async function getMediaAssets(opts: { type?: "image" | "video" | "file" }) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = opts.type ? eq(mediaAssets.type, opts.type) : undefined;
  return db.select().from(mediaAssets).where(whereClause).orderBy(desc(mediaAssets.createdAt));
}

export async function deleteMediaAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  return { success: true };
}

export async function getMediaAssetById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateMediaAssetPlaybackMeta(
  id: number,
  data: Partial<Pick<InsertMediaAsset, "posterUrl" | "hlsManifestKey" | "hlsManifestUrl" | "transcodeJobId" | "transcodeStatus">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(mediaAssets).set(data).where(eq(mediaAssets.id, id));
  return getMediaAssetById(id);
}

const DEFAULT_TRANSCODE_PROFILE = "adaptive-720p";

type TranscodeCallbackStatus = "processing" | "ready" | "failed" | "cancelled";

function stringifyJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJsonText<T = unknown>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeProgress(value?: number | null, fallback = 0) {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue)) return Math.max(0, Math.min(100, fallback));
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

export async function getTranscodeJobById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({
      id: transcodeJobs.id,
      mediaId: transcodeJobs.mediaId,
      requestedBy: transcodeJobs.requestedBy,
      provider: transcodeJobs.provider,
      status: transcodeJobs.status,
      profile: transcodeJobs.profile,
      outputPrefix: transcodeJobs.outputPrefix,
      callbackToken: transcodeJobs.callbackToken,
      externalJobId: transcodeJobs.externalJobId,
      progress: transcodeJobs.progress,
      errorMessage: transcodeJobs.errorMessage,
      requestPayload: transcodeJobs.requestPayload,
      responsePayload: transcodeJobs.responsePayload,
      startedAt: transcodeJobs.startedAt,
      finishedAt: transcodeJobs.finishedAt,
      createdAt: transcodeJobs.createdAt,
      updatedAt: transcodeJobs.updatedAt,
      asset: {
        id: mediaAssets.id,
        originName: mediaAssets.originName,
        type: mediaAssets.type,
        source: mediaAssets.source,
        storageKey: mediaAssets.storageKey,
        url: mediaAssets.url,
        accessLevel: mediaAssets.accessLevel,
        transcodeStatus: mediaAssets.transcodeStatus,
        hlsManifestKey: mediaAssets.hlsManifestKey,
        hlsManifestUrl: mediaAssets.hlsManifestUrl,
        posterUrl: mediaAssets.posterUrl,
      },
    })
    .from(transcodeJobs)
    .leftJoin(mediaAssets, eq(transcodeJobs.mediaId, mediaAssets.id))
    .where(eq(transcodeJobs.id, id))
    .limit(1);

  const row = result[0];
  if (!row) return null;
  return {
    ...row,
    requestPayload: parseJsonText(row.requestPayload),
    responsePayload: parseJsonText(row.responsePayload),
  };
}

export async function listTranscodeJobs(opts: { mediaId?: number; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [] as any[];
  if (opts.mediaId) {
    conditions.push(eq(transcodeJobs.mediaId, opts.mediaId));
  }
  const rows = await db
    .select({
      id: transcodeJobs.id,
      mediaId: transcodeJobs.mediaId,
      requestedBy: transcodeJobs.requestedBy,
      provider: transcodeJobs.provider,
      status: transcodeJobs.status,
      profile: transcodeJobs.profile,
      outputPrefix: transcodeJobs.outputPrefix,
      callbackToken: transcodeJobs.callbackToken,
      externalJobId: transcodeJobs.externalJobId,
      progress: transcodeJobs.progress,
      errorMessage: transcodeJobs.errorMessage,
      requestPayload: transcodeJobs.requestPayload,
      responsePayload: transcodeJobs.responsePayload,
      startedAt: transcodeJobs.startedAt,
      finishedAt: transcodeJobs.finishedAt,
      createdAt: transcodeJobs.createdAt,
      updatedAt: transcodeJobs.updatedAt,
      asset: {
        id: mediaAssets.id,
        originName: mediaAssets.originName,
        type: mediaAssets.type,
        source: mediaAssets.source,
        accessLevel: mediaAssets.accessLevel,
        transcodeStatus: mediaAssets.transcodeStatus,
      },
    })
    .from(transcodeJobs)
    .leftJoin(mediaAssets, eq(transcodeJobs.mediaId, mediaAssets.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transcodeJobs.createdAt), desc(transcodeJobs.id))
    .limit(opts.limit ?? 30);

  return rows.map((row) => ({
    ...row,
    requestPayload: parseJsonText(row.requestPayload),
    responsePayload: parseJsonText(row.responsePayload),
  }));
}

export async function queueMediaAssetTranscode(id: number, requestedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const asset = await getMediaAssetById(id);
  if (!asset) throw new Error("媒体不存在");

  const callbackToken = crypto.randomUUID().replace(/-/g, "");
  const provider: InsertTranscodeJob["provider"] = ENV.transcodeWebhookUrl ? "webhook" : "manual";
  const outputPrefix = `transcoded/media-${id}/${Date.now()}`;

  await db.insert(transcodeJobs).values({
    mediaId: id,
    requestedBy,
    provider,
    status: "queued",
    profile: DEFAULT_TRANSCODE_PROFILE,
    outputPrefix,
    callbackToken,
    progress: 0,
  });

  const [jobRow] = await db
    .select({ id: transcodeJobs.id })
    .from(transcodeJobs)
    .where(eq(transcodeJobs.callbackToken, callbackToken))
    .limit(1);

  await db
    .update(mediaAssets)
    .set({
      transcodeStatus: "queued",
      transcodeJobId: jobRow?.id ? `job_${jobRow.id}` : asset.transcodeJobId,
    })
    .where(eq(mediaAssets.id, id));

  return getMediaAssetById(id);
}

export async function markTranscodeJobDispatched(
  id: number,
  data: {
    provider?: InsertTranscodeJob["provider"];
    externalJobId?: string | null;
    requestPayload?: unknown;
    responsePayload?: unknown;
  } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const job = await getTranscodeJobById(id);
  if (!job) throw new Error("转码任务不存在");

  await db
    .update(transcodeJobs)
    .set({
      provider: data.provider ?? job.provider,
      status: "dispatched",
      externalJobId: data.externalJobId ?? job.externalJobId ?? null,
      requestPayload: stringifyJson(data.requestPayload ?? job.requestPayload),
      responsePayload: stringifyJson(data.responsePayload ?? job.responsePayload),
      progress: Math.max(5, Number(job.progress ?? 0)),
      startedAt: job.startedAt ?? new Date(),
      errorMessage: null,
    })
    .where(eq(transcodeJobs.id, id));

  await db
    .update(mediaAssets)
    .set({
      transcodeStatus: "processing",
      transcodeJobId: data.externalJobId ?? job.externalJobId ?? `job_${job.id}`,
    })
    .where(eq(mediaAssets.id, job.mediaId));

  return getTranscodeJobById(id);
}

export async function applyTranscodeJobCallback(opts: {
  jobId: number;
  callbackToken?: string | null;
  status: TranscodeCallbackStatus;
  progress?: number | null;
  externalJobId?: string | null;
  posterUrl?: string | null;
  hlsManifestKey?: string | null;
  hlsManifestUrl?: string | null;
  errorMessage?: string | null;
  responsePayload?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const job = await getTranscodeJobById(opts.jobId);
  if (!job) throw new Error("转码任务不存在");
  if (opts.callbackToken && job.callbackToken !== opts.callbackToken) {
    throw new Error("转码回调令牌无效");
  }

  const statusMap = {
    processing: "processing",
    ready: "succeeded",
    failed: "failed",
    cancelled: "cancelled",
  } as const;
  const progress = normalizeProgress(
    opts.progress,
    opts.status === "ready" ? 100 : opts.status === "processing" ? 50 : job.progress
  );
  const finishedAt = opts.status === "ready" || opts.status === "failed" || opts.status === "cancelled" ? new Date() : null;

  await db
    .update(transcodeJobs)
    .set({
      status: statusMap[opts.status],
      progress,
      externalJobId: opts.externalJobId ?? job.externalJobId ?? null,
      errorMessage: opts.errorMessage ?? null,
      responsePayload: stringifyJson(opts.responsePayload ?? job.responsePayload),
      startedAt: job.startedAt ?? new Date(),
      finishedAt,
    })
    .where(eq(transcodeJobs.id, opts.jobId));

  if (opts.status === "processing") {
    await db
      .update(mediaAssets)
      .set({
        transcodeStatus: "processing",
        transcodeJobId: opts.externalJobId ?? job.externalJobId ?? `job_${job.id}`,
      })
      .where(eq(mediaAssets.id, job.mediaId));
  }

  if (opts.status === "ready") {
    if (!opts.hlsManifestKey && !opts.hlsManifestUrl) {
      throw new Error("转码完成回调必须提供 manifestKey 或 manifestUrl");
    }
    await db
      .update(mediaAssets)
      .set({
        transcodeStatus: "ready",
        transcodeJobId: opts.externalJobId ?? job.externalJobId ?? `job_${job.id}`,
        posterUrl: opts.posterUrl ?? job.asset?.posterUrl ?? null,
        hlsManifestKey: opts.hlsManifestKey ?? job.asset?.hlsManifestKey ?? null,
        hlsManifestUrl: opts.hlsManifestUrl ?? job.asset?.hlsManifestUrl ?? null,
      })
      .where(eq(mediaAssets.id, job.mediaId));
  }

  if (opts.status === "failed" || opts.status === "cancelled") {
    await db
      .update(mediaAssets)
      .set({
        transcodeStatus: "failed",
        transcodeJobId: opts.externalJobId ?? job.externalJobId ?? `job_${job.id}`,
      })
      .where(eq(mediaAssets.id, job.mediaId));
  }

  return {
    job: await getTranscodeJobById(opts.jobId),
    asset: await getMediaAssetById(job.mediaId),
  };
}

export async function retryTranscodeJob(id: number, requestedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const job = await getTranscodeJobById(id);
  if (!job) throw new Error("转码任务不存在");
  const callbackToken = crypto.randomUUID().replace(/-/g, "");

  await db
    .update(transcodeJobs)
    .set({
      requestedBy: requestedBy ?? job.requestedBy ?? null,
      status: "queued",
      callbackToken,
      externalJobId: null,
      progress: 0,
      errorMessage: null,
      requestPayload: null,
      responsePayload: null,
      startedAt: null,
      finishedAt: null,
    })
    .where(eq(transcodeJobs.id, id));

  await db
    .update(mediaAssets)
    .set({
      transcodeStatus: "queued",
      transcodeJobId: `job_${id}`,
    })
    .where(eq(mediaAssets.id, job.mediaId));

  return getTranscodeJobById(id);
}

export function getMediaDeliveryUrl(asset: { id: number; url: string; source?: string | null; accessLevel?: string | null }) {
  if (!asset) return "";
  if (asset.source === "storage" || asset.accessLevel === "protected") {
    return `/api/media/${asset.id}/content`;
  }
  return asset.url;
}

async function getMediaAssetReferences(mediaId: number) {
  const db = await getDb();
  if (!db) return [] as Array<{ courseId: number; chapterId: number | null; matchType: string }>;
  const asset = await getMediaAssetById(mediaId);
  if (!asset) return [];

  const possibleUrls = Array.from(new Set([asset.url, getMediaDeliveryUrl(asset)]));
  const [urlA, urlB] = [possibleUrls[0], possibleUrls[1] ?? possibleUrls[0]];
  const courseCoverMatches = await db
    .select({
      courseId: courses.id,
      chapterId: sql<number | null>`NULL`,
      matchType: sql<string>`'course-cover'`,
    })
    .from(courses)
    .where(or(eq(courses.coverUrl, urlA), eq(courses.coverUrl, urlB)));

  const courseVideoMatches = await db
    .select({
      courseId: courses.id,
      chapterId: sql<number | null>`NULL`,
      matchType: sql<string>`'course-video'`,
    })
    .from(courses)
    .where(or(eq(courses.videoUrl, urlA), eq(courses.videoUrl, urlB)));

  const chapterMatches = await db
    .select({
      courseId: chapters.courseId,
      chapterId: chapters.id,
      matchType: sql<string>`'chapter-video'`,
    })
    .from(chapters)
    .where(or(eq(chapters.videoUrl, possibleUrls[0]), eq(chapters.videoUrl, possibleUrls[1])));

  return [...courseCoverMatches, ...courseVideoMatches, ...chapterMatches];
}

export async function evaluateCourseAccess(opts: {
  courseId: number;
  chapterId?: number | null;
  userId?: number | null;
  userRole?: "user" | "admin" | null;
}) {
  const course = await getCourseById(opts.courseId);
  if (!course) return { allowed: false, reason: "COURSE_NOT_FOUND" as const };
  if (opts.userRole === "admin") return { allowed: true, reason: "ADMIN" as const };

  const chaptersOfCourse = await getChaptersByCourseId(opts.courseId);
  const chapter = opts.chapterId ? chaptersOfCourse.find((item) => item.id === opts.chapterId) : null;
  if (chapter?.isFree) return { allowed: true, reason: "FREE_CHAPTER" as const };
  if (chapter) {
    const chapterIndex = chaptersOfCourse.findIndex((item) => item.id === chapter.id);
    if (chapterIndex >= 0 && chapterIndex < Number(course.trialChapterCount ?? 0)) {
      return { allowed: true, reason: "TRIAL_CHAPTER" as const };
    }
  }

  if (course.accessType === "free") return { allowed: true, reason: "FREE_COURSE" as const };
  if (!opts.userId) return { allowed: false, reason: "LOGIN_REQUIRED" as const };
  if (course.accessType === "login") return { allowed: true, reason: "AUTHENTICATED" as const };

  const access = await getMyAccessSummary(opts.userId);
  if (course.accessType === "vip") {
    return access.hasVip
      ? { allowed: true, reason: "VIP" as const }
      : { allowed: false, reason: "VIP_REQUIRED" as const };
  }
  if (course.accessType === "paid") {
    return access.entitledCourseIds.includes(opts.courseId)
      ? { allowed: true, reason: "PURCHASED" as const }
      : { allowed: false, reason: "PURCHASE_REQUIRED" as const };
  }
  return { allowed: false, reason: "FORBIDDEN" as const };
}

export async function canAccessMediaAsset(opts: {
  mediaId: number;
  userId?: number | null;
  userRole?: "user" | "admin" | null;
}) {
  const asset = await getMediaAssetById(opts.mediaId);
  if (!asset) return { allowed: false, reason: "NOT_FOUND" as const, asset: null };
  if (asset.accessLevel !== "protected") {
    return { allowed: true, reason: "PUBLIC" as const, asset };
  }
  if (opts.userRole === "admin") {
    return { allowed: true, reason: "ADMIN" as const, asset };
  }

  const references = await getMediaAssetReferences(opts.mediaId);
  if (references.length === 0) {
    return { allowed: false, reason: "UNBOUND_PROTECTED_ASSET" as const, asset };
  }

  for (const ref of references) {
    const access = await evaluateCourseAccess({
      courseId: ref.courseId,
      chapterId: ref.chapterId,
      userId: opts.userId,
      userRole: opts.userRole,
    });
    if (access.allowed) return { allowed: true, reason: access.reason, asset };
  }

  return { allowed: false, reason: "COURSE_ACCESS_REQUIRED" as const, asset };
}

async function appendLearningHistory(userId: number, courseId: number, chapterId?: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(userLearningHistory).values({ userId, courseId, chapterId });
}

async function recomputeCourseProgress(
  userId: number,
  courseId: number,
  overrides?: { lastChapterId?: number | null; lastPositionSeconds?: number }
) {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(userCourseProgress)
    .where(and(eq(userCourseProgress.userId, userId), eq(userCourseProgress.courseId, courseId)))
    .limit(1);

  const chapterRows = await db
    .select({
      chapterId: chapters.id,
      duration: chapters.duration,
      watchedSeconds: userChapterProgress.watchedSeconds,
      completed: userChapterProgress.completed,
    })
    .from(chapters)
    .leftJoin(
      userChapterProgress,
      and(eq(userChapterProgress.chapterId, chapters.id), eq(userChapterProgress.userId, userId))
    )
    .where(eq(chapters.courseId, courseId));

  const [courseRow] = await db
    .select({ duration: courses.duration })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  const totalDuration =
    chapterRows.reduce((sum, row) => sum + Number(row.duration ?? 0), 0) || Number(courseRow?.duration ?? 0);
  const watchedSeconds = chapterRows.reduce((sum, row) => {
    const watched = Number(row.watchedSeconds ?? 0);
    const duration = Number(row.duration ?? 0);
    if (duration > 0) return sum + Math.min(watched, duration);
    return sum + watched;
  }, 0);
  const completedChapterCount = chapterRows.filter((row) => Boolean(row.completed)).length;
  const completedAll = chapterRows.length > 0 && completedChapterCount === chapterRows.length;
  const progressPercent = totalDuration > 0 ? Math.min(100, Math.round((watchedSeconds / totalDuration) * 100)) : completedAll ? 100 : 0;
  const lastChapterId = overrides?.lastChapterId ?? existing?.lastChapterId ?? null;
  const lastPositionSeconds = overrides?.lastPositionSeconds ?? existing?.lastPositionSeconds ?? 0;
  const completedAt = completedAll ? existing?.completedAt ?? new Date() : null;

  await db
    .insert(userCourseProgress)
    .values({
      userId,
      courseId,
      progressPercent,
      lastChapterId: lastChapterId ?? undefined,
      lastPositionSeconds,
      completedAt: completedAt ?? undefined,
    })
    .onDuplicateKeyUpdate({
      set: {
        progressPercent,
        lastChapterId: lastChapterId ?? null,
        lastPositionSeconds,
        completedAt: completedAt ?? null,
      },
    });

  return getCourseProgress(userId, courseId);
}

export async function getCourseProgress(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) {
    return {
      progressPercent: 0,
      lastChapterId: null,
      lastPositionSeconds: 0,
      completedAt: null,
      completedChapterIds: [] as number[],
    };
  }

  const [courseProgress] = await db
    .select()
    .from(userCourseProgress)
    .where(and(eq(userCourseProgress.userId, userId), eq(userCourseProgress.courseId, courseId)))
    .limit(1);

  const chapterProgressRows = await db
    .select({
      chapterId: userChapterProgress.chapterId,
      watchedSeconds: userChapterProgress.watchedSeconds,
      completed: userChapterProgress.completed,
    })
    .from(userChapterProgress)
    .leftJoin(chapters, eq(userChapterProgress.chapterId, chapters.id))
    .where(and(eq(userChapterProgress.userId, userId), eq(chapters.courseId, courseId)));

  return {
    progressPercent: Number(courseProgress?.progressPercent ?? 0),
    lastChapterId: courseProgress?.lastChapterId ?? null,
    lastPositionSeconds: Number(courseProgress?.lastPositionSeconds ?? 0),
    completedAt: courseProgress?.completedAt ?? null,
    completedChapterIds: chapterProgressRows.filter((row) => row.completed).map((row) => row.chapterId),
    chapterProgress: chapterProgressRows,
  };
}

export async function saveCoursePlayback(opts: {
  userId: number;
  courseId: number;
  chapterId?: number;
  positionSeconds: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  if (opts.chapterId) {
    const [chapterRow] = await db.select().from(chapters).where(eq(chapters.id, opts.chapterId)).limit(1);
    const safePosition = Math.max(0, Math.round(opts.positionSeconds));
    const watchedSeconds = chapterRow?.duration ? Math.min(safePosition, chapterRow.duration) : safePosition;
    await db
      .insert(userChapterProgress)
      .values({
        userId: opts.userId,
        chapterId: opts.chapterId,
        watchedSeconds,
        completed: chapterRow?.duration ? watchedSeconds >= chapterRow.duration - 5 : false,
      })
      .onDuplicateKeyUpdate({
        set: {
          watchedSeconds,
          completed: chapterRow?.duration ? watchedSeconds >= chapterRow.duration - 5 : false,
        },
      });
  }

  await appendLearningHistory(opts.userId, opts.courseId, opts.chapterId);
  return recomputeCourseProgress(opts.userId, opts.courseId, {
    lastChapterId: opts.chapterId ?? null,
    lastPositionSeconds: Math.max(0, Math.round(opts.positionSeconds)),
  });
}

export async function completeCourseChapter(opts: { userId: number; courseId: number; chapterId: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [chapterRow] = await db.select().from(chapters).where(eq(chapters.id, opts.chapterId)).limit(1);
  const watchedSeconds = Number(chapterRow?.duration ?? 0);

  await db
    .insert(userChapterProgress)
    .values({
      userId: opts.userId,
      chapterId: opts.chapterId,
      watchedSeconds,
      completed: true,
    })
    .onDuplicateKeyUpdate({
      set: {
        watchedSeconds,
        completed: true,
      },
    });

  await appendLearningHistory(opts.userId, opts.courseId, opts.chapterId);
  return recomputeCourseProgress(opts.userId, opts.courseId, {
    lastChapterId: opts.chapterId,
    lastPositionSeconds: watchedSeconds,
  });
}

export async function getMyLearningOverview(userId: number) {
  const db = await getDb();
  if (!db) return { courses: [], activities: [], favorites: [] };

  const courseRows = await db
    .select({
      progressId: userCourseProgress.id,
      progressPercent: userCourseProgress.progressPercent,
      lastChapterId: userCourseProgress.lastChapterId,
      lastPositionSeconds: userCourseProgress.lastPositionSeconds,
      completedAt: userCourseProgress.completedAt,
      progressUpdatedAt: userCourseProgress.updatedAt,
      ...baseCourseSelect(),
    })
    .from(userCourseProgress)
    .leftJoin(courses, eq(userCourseProgress.courseId, courses.id))
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(userCourseProgress.userId, userId))
    .orderBy(desc(userCourseProgress.updatedAt));

  const activities = await db
    .select({
      id: userLearningHistory.id,
      viewedAt: userLearningHistory.viewedAt,
      chapterId: userLearningHistory.chapterId,
      chapterTitle: chapters.title,
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
      },
    })
    .from(userLearningHistory)
    .leftJoin(courses, eq(userLearningHistory.courseId, courses.id))
    .leftJoin(chapters, eq(userLearningHistory.chapterId, chapters.id))
    .where(eq(userLearningHistory.userId, userId))
    .orderBy(desc(userLearningHistory.viewedAt))
    .limit(10);

  const favorites = await listFavoriteCourses(userId);

  return {
    courses: courseRows.map(
      ({ progressId, progressPercent, lastChapterId, lastPositionSeconds, completedAt, progressUpdatedAt, ...course }) => ({
        progressId,
        progressPercent,
        lastChapterId,
        lastPositionSeconds,
        completedAt,
        updatedAt: progressUpdatedAt,
        course: mapCourseRow(course),
      })
    ),
    activities,
    favorites,
  };
}


export async function getFavoriteStatus(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) return { isFavorite: false };
  const [favorite] = await db
    .select({ id: userFavorites.id })
    .from(userFavorites)
    .where(and(eq(userFavorites.userId, userId), eq(userFavorites.courseId, courseId)))
    .limit(1);
  return { isFavorite: Boolean(favorite?.id) };
}

export async function toggleFavorite(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [favorite] = await db
    .select({ id: userFavorites.id })
    .from(userFavorites)
    .where(and(eq(userFavorites.userId, userId), eq(userFavorites.courseId, courseId)))
    .limit(1);

  if (favorite?.id) {
    await db.delete(userFavorites).where(eq(userFavorites.id, favorite.id));
    return { isFavorite: false };
  }

  await db.insert(userFavorites).values({ userId, courseId });
  return { isFavorite: true };
}

export async function listFavoriteCourses(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      favoriteId: userFavorites.id,
      favoritedAt: userFavorites.createdAt,
      ...baseCourseSelect(),
    })
    .from(userFavorites)
    .leftJoin(courses, eq(userFavorites.courseId, courses.id))
    .leftJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(userFavorites.userId, userId))
    .orderBy(desc(userFavorites.createdAt))
    .then((rows) =>
      rows.map(({ favoriteId, favoritedAt, ...course }) => ({
        favoriteId,
        createdAt: favoritedAt,
        course: mapCourseRow(course),
      }))
    );
}

export async function listSystemSettingOverrides() {
  const db = await getDb();
  if (!db) return [] as Array<{ id: number; settingKey: string; value: string | null; updatedBy: number | null; createdAt: Date; updatedAt: Date }>;
  return db.select().from(systemSettings).orderBy(asc(systemSettings.settingKey));
}

export async function getSystemSettingOverrideMap() {
  const rows = await listSystemSettingOverrides();
  return Object.fromEntries(rows.map((row) => [row.settingKey, row.value ?? ""]));
}

function hashSystemSettingValue(value: string | null | undefined) {
  const raw = value ?? "";
  return createHash("sha256").update(raw).digest("hex");
}

function buildSystemSettingPreview(settingKey: string, value: string | null | undefined) {
  const definition = SYSTEM_SETTING_MAP.get(settingKey);
  return maskSettingValue(value, definition?.secret);
}

function buildSnapshotPayloadFromEntries(
  entries: Array<{ settingKey: string; value: string | null | undefined }>,
  meta?: { name?: string; description?: string | null; snapshotType?: "export" | "import" | "restore"; strategy?: "merge" | "replace" }
) {
  const deduped = new Map<string, string>();
  for (const entry of entries) {
    if (!entry?.settingKey) continue;
    deduped.set(entry.settingKey, entry.value ?? "");
  }
  const items = Array.from(deduped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
  return {
    kind: "learnflow.system-config.snapshot",
    version: 1,
    snapshotType: meta?.snapshotType ?? "export",
    strategy: meta?.strategy ?? "merge",
    name: meta?.name ?? `系统配置快照 ${new Date().toLocaleString("zh-CN")}`,
    description: meta?.description ?? "",
    exportedAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  };
}

function parseSystemConfigSnapshot(rawJson: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("快照 JSON 解析失败，请检查格式是否正确");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("快照内容无效");
  }
  if (parsed.kind !== "learnflow.system-config.snapshot") {
    throw new Error("不是 LearnFlow 系统配置快照");
  }
  if (!Array.isArray(parsed.items)) {
    throw new Error("快照 items 字段无效");
  }
  const items = parsed.items.map((item: any, index: number) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${index + 1} 项配置无效`);
    }
    const key = String(item.key ?? "").trim();
    if (!key) {
      throw new Error(`第 ${index + 1} 项缺少 key`);
    }
    return {
      key,
      value: item.value === null || item.value === undefined ? "" : String(item.value),
    };
  });
  return {
    kind: parsed.kind,
    version: Number(parsed.version ?? 1),
    snapshotType: ["export", "import", "restore"].includes(parsed.snapshotType) ? parsed.snapshotType : "export",
    strategy: ["merge", "replace"].includes(parsed.strategy) ? parsed.strategy : "merge",
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : `导入快照 ${new Date().toLocaleString("zh-CN")}`,
    description: typeof parsed.description === "string" ? parsed.description : "",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    items,
  };
}

async function insertSystemSettingAuditLogs(
  logs: Array<{
    settingKey?: string | null;
    action: "set" | "clear" | "import" | "restore" | "export";
    changeSource: "admin_ui" | "snapshot_import" | "snapshot_restore" | "snapshot_export";
    snapshotId?: number | null;
    updatedBy?: number | null;
    previousValue?: string | null;
    nextValue?: string | null;
    metadata?: Record<string, unknown> | null;
  }>
) {
  const db = await getDb();
  if (!db || !logs.length) return;
  await db.insert(systemSettingAuditLogs).values(
    logs.map((log) => {
      const settingKey = log.settingKey ?? null;
      const definition = settingKey ? SYSTEM_SETTING_MAP.get(settingKey) : null;
      return {
        settingKey,
        action: log.action,
        changeSource: log.changeSource,
        snapshotId: log.snapshotId ?? null,
        updatedBy: log.updatedBy ?? null,
        isSecret: Boolean(definition?.secret),
        previousValuePreview: settingKey ? buildSystemSettingPreview(settingKey, log.previousValue) : null,
        nextValuePreview: settingKey ? buildSystemSettingPreview(settingKey, log.nextValue) : null,
        previousValueHash: log.previousValue !== undefined && log.previousValue !== null ? hashSystemSettingValue(log.previousValue) : null,
        nextValueHash: log.nextValue !== undefined && log.nextValue !== null ? hashSystemSettingValue(log.nextValue) : null,
        metadata: log.metadata ? JSON.stringify(log.metadata) : null,
      };
    })
  );
}

async function createSystemConfigSnapshotRecord(input: {
  snapshotType: "export" | "import" | "restore";
  strategy: "merge" | "replace";
  name: string;
  description?: string | null;
  payload: string;
  itemCount: number;
  createdBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const checksum = createHash("sha256").update(input.payload).digest("hex");
  await db.insert(systemConfigSnapshots).values({
    snapshotType: input.snapshotType,
    strategy: input.strategy,
    name: input.name,
    description: input.description ?? null,
    payload: input.payload,
    itemCount: input.itemCount,
    checksum,
    createdBy: input.createdBy ?? null,
  });
  const [row] = await db.select().from(systemConfigSnapshots).where(eq(systemConfigSnapshots.checksum, checksum)).orderBy(desc(systemConfigSnapshots.id)).limit(1);
  return row ?? null;
}

export async function reloadRuntimeConfigFromDb() {
  const overrides = await getSystemSettingOverrideMap();
  refreshEnvFromSystemOverrides(overrides);
  return overrides;
}

export async function getSystemConfigOverview() {
  const rows = await listSystemSettingOverrides();
  const overrideMap = new Map(rows.map((row) => [row.settingKey, row]));
  const categories: Record<string, any[]> = {};
  for (const definition of SYSTEM_SETTING_DEFINITIONS) {
    const row = overrideMap.get(definition.key);
    const serialized = serializeSystemSettingOverview(definition.key, row?.value ?? null);
    if (!serialized) continue;
    const categoryItems = categories[definition.category] ?? [];
    categoryItems.push({
      ...serialized,
      overrideMeta: row
        ? {
            id: row.id,
            updatedBy: row.updatedBy,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        : null,
    });
    categories[definition.category] = categoryItems;
  }
  return {
    items: SYSTEM_SETTING_DEFINITIONS.map((definition) => {
      const row = overrideMap.get(definition.key);
      return {
        ...serializeSystemSettingOverview(definition.key, row?.value ?? null),
        overrideMeta: row
          ? {
              id: row.id,
              updatedBy: row.updatedBy,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }
          : null,
      };
    }).filter(Boolean),
    categories,
  };
}

export async function listSystemConfigAuditLogs(input?: { limit?: number; settingKey?: string }) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const filters = [] as any[];
  if (input?.settingKey?.trim()) filters.push(eq(systemSettingAuditLogs.settingKey, input.settingKey.trim()));
  const rows = await db
    .select({
      id: systemSettingAuditLogs.id,
      settingKey: systemSettingAuditLogs.settingKey,
      action: systemSettingAuditLogs.action,
      changeSource: systemSettingAuditLogs.changeSource,
      snapshotId: systemSettingAuditLogs.snapshotId,
      isSecret: systemSettingAuditLogs.isSecret,
      previousValuePreview: systemSettingAuditLogs.previousValuePreview,
      nextValuePreview: systemSettingAuditLogs.nextValuePreview,
      previousValueHash: systemSettingAuditLogs.previousValueHash,
      nextValueHash: systemSettingAuditLogs.nextValueHash,
      metadata: systemSettingAuditLogs.metadata,
      createdAt: systemSettingAuditLogs.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      snapshotName: systemConfigSnapshots.name,
      snapshotType: systemConfigSnapshots.snapshotType,
    })
    .from(systemSettingAuditLogs)
    .leftJoin(users, eq(systemSettingAuditLogs.updatedBy, users.id))
    .leftJoin(systemConfigSnapshots, eq(systemSettingAuditLogs.snapshotId, systemConfigSnapshots.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(systemSettingAuditLogs.id))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    metadata: row.metadata ? (() => { try { return JSON.parse(row.metadata); } catch { return row.metadata; } })() : null,
  }));
}

export async function listSystemConfigSnapshots(input?: { limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input?.limit ?? 30, 1), 100);
  const rows = await db
    .select({
      id: systemConfigSnapshots.id,
      snapshotType: systemConfigSnapshots.snapshotType,
      strategy: systemConfigSnapshots.strategy,
      name: systemConfigSnapshots.name,
      description: systemConfigSnapshots.description,
      itemCount: systemConfigSnapshots.itemCount,
      checksum: systemConfigSnapshots.checksum,
      createdAt: systemConfigSnapshots.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(systemConfigSnapshots)
    .leftJoin(users, eq(systemConfigSnapshots.createdBy, users.id))
    .orderBy(desc(systemConfigSnapshots.id))
    .limit(limit);
  return rows;
}

export async function getSystemConfigSnapshotDownload(snapshotId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(systemConfigSnapshots).where(eq(systemConfigSnapshots.id, snapshotId)).limit(1);
  if (!row) throw new Error("快照不存在");
  return {
    snapshotId: row.id,
    name: row.name,
    snapshotType: row.snapshotType,
    strategy: row.strategy,
    itemCount: row.itemCount,
    checksum: row.checksum,
    createdAt: row.createdAt,
    payload: row.payload,
    fileName: `${row.name.replace(/[^a-zA-Z0-9一-龥-_]+/g, "-") || "system-config-snapshot"}-${row.id}.json`,
  };
}

export async function previewSystemConfigSnapshotImport(input: { rawJson: string; strategy?: "merge" | "replace" }) {
  const parsed = parseSystemConfigSnapshot(input.rawJson);
  const currentRows = await listSystemSettingOverrides();
  const currentMap = new Map(currentRows.map((row) => [row.settingKey, row.value ?? ""]));
  const nextMap = new Map<string, string>();
  const duplicateKeys = new Set<string>();
  const unsupportedKeys: string[] = [];
  for (const item of parsed.items) {
    if (nextMap.has(item.key)) duplicateKeys.add(item.key);
    if (!SYSTEM_SETTING_MAP.has(item.key)) {
      unsupportedKeys.push(item.key);
      continue;
    }
    nextMap.set(item.key, item.value);
  }
  const changes: Array<{ key: string; action: "create" | "update" | "unchanged" | "clear"; before: string; after: string; secret: boolean }> = [];
  for (const [key, nextValue] of Array.from(nextMap.entries())) {
    const definition = SYSTEM_SETTING_MAP.get(key)!;
    const prevValue = currentMap.has(key) ? currentMap.get(key) ?? "" : null;
    const action = prevValue === null ? "create" : prevValue === nextValue ? "unchanged" : "update";
    changes.push({
      key,
      action,
      before: buildSystemSettingPreview(key, prevValue),
      after: buildSystemSettingPreview(key, nextValue),
      secret: Boolean(definition.secret),
    });
  }
  const strategy = input.strategy ?? parsed.strategy ?? "merge";
  if (strategy === "replace") {
    for (const [key, prevValue] of Array.from(currentMap.entries())) {
      if (nextMap.has(key)) continue;
      const definition = SYSTEM_SETTING_MAP.get(key);
      changes.push({
        key,
        action: "clear",
        before: buildSystemSettingPreview(key, prevValue),
        after: "",
        secret: Boolean(definition?.secret),
      });
    }
  }
  const createCount = changes.filter((item) => item.action === "create").length;
  const updateCount = changes.filter((item) => item.action === "update").length;
  const unchangedCount = changes.filter((item) => item.action === "unchanged").length;
  const clearCount = changes.filter((item) => item.action === "clear").length;
  return {
    snapshot: {
      name: parsed.name,
      description: parsed.description,
      exportedAt: parsed.exportedAt,
      itemCount: parsed.items.length,
    },
    strategy,
    unsupportedKeys,
    duplicateKeys: Array.from(duplicateKeys),
    summary: {
      totalItems: parsed.items.length,
      validItems: nextMap.size,
      createCount,
      updateCount,
      unchangedCount,
      clearCount,
    },
    changes: changes.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

async function applySystemConfigSnapshot(input: {
  rawJson: string;
  strategy?: "merge" | "replace";
  updatedBy?: number | null;
  snapshotType: "import" | "restore";
  changeSource: "snapshot_import" | "snapshot_restore";
  name?: string;
  description?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const preview = await previewSystemConfigSnapshotImport({ rawJson: input.rawJson, strategy: input.strategy });
  if (preview.unsupportedKeys.length) {
    throw new Error(`快照包含不支持的配置项：${preview.unsupportedKeys.join(", ")}`);
  }
  const parsed = parseSystemConfigSnapshot(input.rawJson);
  const normalizedEntries = Array.from(
    new Map<string, string | null | undefined>(
      parsed.items
        .filter((item: { key: string; value?: string | null }) => SYSTEM_SETTING_MAP.has(item.key))
        .map((item: { key: string; value?: string | null }) => [item.key, item.value] as const)
    ).entries()
  ).map(([key, value]) => ({ settingKey: key, value }));
  const payload = JSON.stringify(
    buildSnapshotPayloadFromEntries(normalizedEntries, {
      name: input.name?.trim() || parsed.name,
      description: input.description ?? parsed.description,
      snapshotType: input.snapshotType,
      strategy: preview.strategy,
    }),
    null,
    2
  );
  const snapshot = await createSystemConfigSnapshotRecord({
    snapshotType: input.snapshotType,
    strategy: preview.strategy,
    name: input.name?.trim() || parsed.name,
    description: input.description ?? parsed.description,
    payload,
    itemCount: normalizedEntries.length,
    createdBy: input.updatedBy ?? null,
  });
  const currentRows = await listSystemSettingOverrides();
  const currentMap = new Map(currentRows.map((row) => [row.settingKey, row.value ?? ""]));
  const nextMap = new Map(normalizedEntries.map((entry) => [entry.settingKey, entry.value ?? ""]));
  const auditLogs: Array<any> = [];

  for (const [key, nextValue] of Array.from(nextMap.entries())) {
    const prevValue = currentMap.has(key) ? currentMap.get(key) ?? "" : null;
    if (prevValue === nextValue) continue;
    await db
      .insert(systemSettings)
      .values({ settingKey: key, value: nextValue, updatedBy: input.updatedBy ?? null })
      .onDuplicateKeyUpdate({ set: { value: nextValue, updatedBy: input.updatedBy ?? null } });
    auditLogs.push({
      settingKey: key,
      action: input.snapshotType,
      changeSource: input.changeSource,
      snapshotId: snapshot?.id ?? null,
      updatedBy: input.updatedBy ?? null,
      previousValue: prevValue,
      nextValue,
      metadata: { strategy: preview.strategy, operation: prevValue === null ? "create" : "update" },
    });
  }

  if (preview.strategy === "replace") {
    for (const [key, prevValue] of Array.from(currentMap.entries())) {
      if (nextMap.has(key)) continue;
      await db.delete(systemSettings).where(eq(systemSettings.settingKey, key));
      auditLogs.push({
        settingKey: key,
        action: input.snapshotType,
        changeSource: input.changeSource,
        snapshotId: snapshot?.id ?? null,
        updatedBy: input.updatedBy ?? null,
        previousValue: prevValue,
        nextValue: null,
        metadata: { strategy: preview.strategy, operation: "clear" },
      });
    }
  }

  await reloadRuntimeConfigFromDb();
  if (auditLogs.length) await insertSystemSettingAuditLogs(auditLogs);
  return {
    snapshotId: snapshot?.id ?? null,
    strategy: preview.strategy,
    summary: preview.summary,
    changedCount: auditLogs.length,
  };
}

export async function exportSystemConfigSnapshot(input?: { createdBy?: number | null; name?: string; description?: string | null }) {
  const rows = await listSystemSettingOverrides();
  const payloadJson = JSON.stringify(
    buildSnapshotPayloadFromEntries(rows, {
      name: input?.name?.trim() || `系统配置导出 ${new Date().toLocaleString("zh-CN")}`,
      description: input?.description ?? "导出当前后台覆盖的系统配置",
      snapshotType: "export",
      strategy: "merge",
    }),
    null,
    2
  );
  const snapshot = await createSystemConfigSnapshotRecord({
    snapshotType: "export",
    strategy: "merge",
    name: input?.name?.trim() || `系统配置导出 ${new Date().toLocaleString("zh-CN")}`,
    description: input?.description ?? "导出当前后台覆盖的系统配置",
    payload: payloadJson,
    itemCount: rows.length,
    createdBy: input?.createdBy ?? null,
  });
  await insertSystemSettingAuditLogs([
    {
      settingKey: null,
      action: "export",
      changeSource: "snapshot_export",
      snapshotId: snapshot?.id ?? null,
      updatedBy: input?.createdBy ?? null,
      metadata: { itemCount: rows.length, snapshotName: snapshot?.name ?? null },
    },
  ]);
  return {
    snapshotId: snapshot?.id ?? null,
    name: snapshot?.name ?? "系统配置导出",
    payload: payloadJson,
    fileName: `${(snapshot?.name ?? "system-config-export").replace(/[^a-zA-Z0-9一-龥-_]+/g, "-") || "system-config-export"}-${snapshot?.id ?? Date.now()}.json`,
    itemCount: rows.length,
  };
}

export async function importSystemConfigSnapshot(input: { rawJson: string; strategy?: "merge" | "replace"; updatedBy?: number | null; name?: string; description?: string | null }) {
  return applySystemConfigSnapshot({
    rawJson: input.rawJson,
    strategy: input.strategy,
    updatedBy: input.updatedBy,
    name: input.name,
    description: input.description,
    snapshotType: "import",
    changeSource: "snapshot_import",
  });
}

export async function restoreSystemConfigSnapshot(input: { snapshotId: number; strategy?: "merge" | "replace"; updatedBy?: number | null }) {
  const snapshot = await getSystemConfigSnapshotDownload(input.snapshotId);
  return applySystemConfigSnapshot({
    rawJson: snapshot.payload,
    strategy: input.strategy,
    updatedBy: input.updatedBy,
    name: `恢复：${snapshot.name}`,
    description: `从快照 #${snapshot.snapshotId} 恢复系统配置`,
    snapshotType: "restore",
    changeSource: "snapshot_restore",
  });
}

export async function upsertSystemSetting(input: { settingKey: string; value: string; updatedBy?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const definition = SYSTEM_SETTING_MAP.get(input.settingKey);
  if (!definition) throw new Error("不支持的系统配置项");
  const normalized = String(input.value ?? "");
  const [beforeRow] = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, input.settingKey)).limit(1);
  await db
    .insert(systemSettings)
    .values({ settingKey: input.settingKey, value: normalized, updatedBy: input.updatedBy ?? null })
    .onDuplicateKeyUpdate({ set: { value: normalized, updatedBy: input.updatedBy ?? null } });
  await reloadRuntimeConfigFromDb();
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, input.settingKey)).limit(1);
  await insertSystemSettingAuditLogs([
    {
      settingKey: input.settingKey,
      action: "set",
      changeSource: "admin_ui",
      updatedBy: input.updatedBy ?? null,
      previousValue: beforeRow?.value ?? null,
      nextValue: normalized,
      metadata: { operation: beforeRow?.id ? "update" : "create" },
    },
  ]);
  return row ?? null;
}

export async function clearSystemSetting(settingKey: string, updatedBy?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [beforeRow] = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, settingKey)).limit(1);
  await db.delete(systemSettings).where(eq(systemSettings.settingKey, settingKey));
  await reloadRuntimeConfigFromDb();
  if (beforeRow) {
    await insertSystemSettingAuditLogs([
      {
        settingKey,
        action: "clear",
        changeSource: "admin_ui",
        updatedBy: updatedBy ?? null,
        previousValue: beforeRow.value ?? null,
        nextValue: null,
        metadata: { operation: "delete" },
      },
    ]);
  }
  return { success: true };
}

export async function sendSystemTestEmail(input: { to: string; adminUserId?: number | null; adminEmail?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const recipient = input.to.trim();
  if (!recipient) throw new Error("请填写测试邮箱地址");
  const eventKey = `system_test_email:${recipient}:${Date.now()}`;
  await db.insert(emailDeliveries).values({
    eventKey,
    eventType: "system_test",
    userId: input.adminUserId ?? null,
    relatedOrderId: null,
    provider: resolveEmailProvider(),
    recipientEmail: recipient,
    subject: "LearnFlow 系统配置测试邮件",
    contentText: [
      "这是一封由 LearnFlow 后台系统配置中心发出的测试邮件。",
      `当前邮件模式：${ENV.emailDeliveryMode}`,
      `发件人：${ENV.emailFromName}${ENV.emailFromAddress ? ` <${ENV.emailFromAddress}>` : ""}`,
      `触发时间：${new Date().toLocaleString("zh-CN")}`,
      input.adminEmail ? `操作人：${input.adminEmail}` : "",
    ].filter(Boolean).join("\n"),
    contentHtml: `<div style="font-family:Arial,sans-serif;padding:24px;"><h1 style="font-size:20px;margin:0 0 16px;">LearnFlow 测试邮件</h1><p>这是一封由后台系统配置中心发出的测试邮件。</p><p>当前邮件模式：<strong>${ENV.emailDeliveryMode}</strong></p><p>触发时间：${new Date().toLocaleString("zh-CN")}</p></div>`,
    payload: safeJsonStringify({ source: "admin-system-config", adminEmail: input.adminEmail ?? null }),
    status: "pending",
  });
  const [created] = await db.select({ id: emailDeliveries.id }).from(emailDeliveries).where(eq(emailDeliveries.eventKey, eventKey)).limit(1);
  if (!created?.id) throw new Error("测试邮件记录创建失败");
  return dispatchEmailDeliveryById(created.id, { force: true });
}

const DEFAULT_HOMEPAGE_SETTINGS = {
  heroBadge: "AI 驱动的学习平台",
  heroTitle: "优雅学习，持续成长",
  heroSubtitle: "把课程内容、学习路径和站点运营配置都收进一个后台里。",
  primaryButtonText: "浏览课程",
  secondaryButtonText: "AI 智能搜索",
  featuredTitle: "优先看看这些精选课程",
  featuredSubtitle: "后台标记为推荐且已发布的课程会优先展示在这里。",
};

function safeParseHomepageConfig(value?: string | null) {
  if (!value) return { ...DEFAULT_HOMEPAGE_SETTINGS };
  try {
    const parsed = JSON.parse(value);
    return { ...DEFAULT_HOMEPAGE_SETTINGS, ...(parsed ?? {}) };
  } catch {
    return { ...DEFAULT_HOMEPAGE_SETTINGS };
  }
}

export async function getHomepageSettings() {
  const db = await getDb();
  if (!db) return { ...DEFAULT_HOMEPAGE_SETTINGS };
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.settingKey, "homepage"))
    .limit(1);
  return safeParseHomepageConfig(row?.value ?? null);
}

export async function upsertHomepageSettings(data: Partial<typeof DEFAULT_HOMEPAGE_SETTINGS>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const merged = { ...DEFAULT_HOMEPAGE_SETTINGS, ...data };
  await db
    .insert(siteSettings)
    .values({ settingKey: "homepage", value: JSON.stringify(merged) })
    .onDuplicateKeyUpdate({ set: { value: JSON.stringify(merged) } });
  return merged;
}

export async function getHomepageBanners(opts: { activeOnly?: boolean } = {}) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = opts.activeOnly ? eq(homepageBanners.isActive, true) : undefined;
  return db
    .select()
    .from(homepageBanners)
    .where(whereClause)
    .orderBy(asc(homepageBanners.sortOrder), desc(homepageBanners.updatedAt));
}

export async function createHomepageBanner(data: Omit<InsertHomepageBanner, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(homepageBanners).values(data);
  const [row] = await db.select().from(homepageBanners).orderBy(desc(homepageBanners.id)).limit(1);
  return row ?? null;
}

export async function updateHomepageBanner(id: number, data: Partial<InsertHomepageBanner>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(homepageBanners).set(data).where(eq(homepageBanners.id, id));
  const [row] = await db.select().from(homepageBanners).where(eq(homepageBanners.id, id)).limit(1);
  return row;
}

export async function deleteHomepageBanner(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(homepageBanners).where(eq(homepageBanners.id, id));
  return { success: true };
}

export async function reorderHomepageBanners(items: Array<{ id: number; sortOrder: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await Promise.all(
    items.map((item) => db.update(homepageBanners).set({ sortOrder: item.sortOrder }).where(eq(homepageBanners.id, item.id)))
  );
  return getHomepageBanners({ activeOnly: false });
}


function generateOrderNo() {
  return `LF${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function isFutureDate(value?: Date | string | null) {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

export async function getProducts(opts: {
  activeOnly?: boolean;
  type?: "course" | "vip";
  status?: "draft" | "active" | "archived" | "all";
} = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [] as any[];
  if (opts.activeOnly) {
    conditions.push(eq(products.status, "active"));
  } else if (opts.status && opts.status !== "all") {
    conditions.push(eq(products.status, opts.status));
  }
  if (opts.type) {
    conditions.push(eq(products.type, opts.type));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  return db
    .select({
      id: products.id,
      type: products.type,
      title: products.title,
      description: products.description,
      status: products.status,
      courseId: products.courseId,
      priceCents: products.priceCents,
      durationDays: products.durationDays,
      coverUrl: products.coverUrl,
      sortOrder: products.sortOrder,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        coverUrl: courses.coverUrl,
        accessType: courses.accessType,
      },
    })
    .from(products)
    .leftJoin(courses, eq(products.courseId, courses.id))
    .where(whereClause)
    .orderBy(asc(products.sortOrder), desc(products.updatedAt));
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: products.id,
      type: products.type,
      title: products.title,
      description: products.description,
      status: products.status,
      courseId: products.courseId,
      priceCents: products.priceCents,
      durationDays: products.durationDays,
      coverUrl: products.coverUrl,
      sortOrder: products.sortOrder,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        coverUrl: courses.coverUrl,
        accessType: courses.accessType,
      },
    })
    .from(products)
    .leftJoin(courses, eq(products.courseId, courses.id))
    .where(eq(products.id, id))
    .limit(1);
  return row ?? null;
}

export async function getCourseProduct(courseId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: products.id,
      type: products.type,
      title: products.title,
      description: products.description,
      status: products.status,
      courseId: products.courseId,
      priceCents: products.priceCents,
      durationDays: products.durationDays,
      coverUrl: products.coverUrl,
      sortOrder: products.sortOrder,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(eq(products.courseId, courseId), eq(products.type, "course"), eq(products.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function createProduct(data: Omit<InsertProduct, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(products).values(data);
  const [row] = await db.select({ id: products.id }).from(products).orderBy(desc(products.id)).limit(1);
  return row ? getProductById(row.id) : null;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(products).set(data).where(eq(products.id, id));
  return getProductById(id);
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(products).where(eq(products.id, id));
  return { success: true };
}

async function ensureOrderBenefits(orderId: number, opts?: { isRepair?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [orderRow] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      orderNo: orders.orderNo,
      productId: orders.productId,
      courseId: orders.courseId,
      amountCents: orders.amountCents,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      benefitsGrantedAt: orders.benefitsGrantedAt,
      product: {
        id: products.id,
        type: products.type,
        title: products.title,
        durationDays: products.durationDays,
      },
    })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow || orderRow.status !== "paid") return null;

  const now = new Date();
  let granted = false;
  let subscriptionId: number | null = null;

  if (orderRow.product?.type === "course" && orderRow.courseId) {
    const [existingEntitlement] = await db
      .select({ id: userEntitlements.id })
      .from(userEntitlements)
      .where(
        and(
          eq(userEntitlements.userId, orderRow.userId),
          eq(userEntitlements.entitlementType, "course"),
          eq(userEntitlements.courseId, orderRow.courseId)
        )
      )
      .limit(1);

    if (existingEntitlement) {
      await db
        .update(userEntitlements)
        .set({
          sourceType: "order",
          orderId: orderRow.id,
          startsAt: now,
          endsAt: null,
        })
        .where(eq(userEntitlements.id, existingEntitlement.id));
    } else {
      await db.insert(userEntitlements).values({
        userId: orderRow.userId,
        entitlementType: "course",
        courseId: orderRow.courseId,
        sourceType: "order",
        orderId: orderRow.id,
        startsAt: now,
        endsAt: null,
      });
    }
    granted = true;
  }

  if (orderRow.product?.type === "vip") {
    const [existingSubscription] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.orderId, orderRow.id))
      .limit(1);

    if (existingSubscription) {
      subscriptionId = existingSubscription.id;
    } else {
      const subscriptions = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, orderRow.userId))
        .orderBy(desc(userSubscriptions.endAt), desc(userSubscriptions.createdAt));
      const activeSubscription = subscriptions.find(
        (item) => item.status === "active" && (!item.endAt || isFutureDate(item.endAt))
      );
      const startAt = activeSubscription?.endAt && isFutureDate(activeSubscription.endAt)
        ? new Date(activeSubscription.endAt)
        : now;
      const endAt = orderRow.product.durationDays
        ? new Date(startAt.getTime() + Number(orderRow.product.durationDays) * 24 * 60 * 60 * 1000)
        : null;

      await db.insert(userSubscriptions).values({
        userId: orderRow.userId,
        productId: orderRow.productId,
        orderId: orderRow.id,
        planName: orderRow.product.title,
        status: "active",
        startAt,
        endAt,
      });
      const [subscriptionRow] = await db
        .select({ id: userSubscriptions.id })
        .from(userSubscriptions)
        .where(eq(userSubscriptions.orderId, orderRow.id))
        .orderBy(desc(userSubscriptions.id))
        .limit(1);
      subscriptionId = subscriptionRow?.id ?? null;
    }

    const [existingVipEntitlement] = await db
      .select({ id: userEntitlements.id })
      .from(userEntitlements)
      .where(and(eq(userEntitlements.orderId, orderRow.id), eq(userEntitlements.entitlementType, "vip")))
      .limit(1);

    const subscription = subscriptionId
      ? (
          await db
            .select({ startAt: userSubscriptions.startAt, endAt: userSubscriptions.endAt })
            .from(userSubscriptions)
            .where(eq(userSubscriptions.id, subscriptionId))
            .limit(1)
        )[0]
      : null;

    const startsAt = subscription?.startAt ?? now;
    const endsAt = subscription?.endAt ?? null;

    if (existingVipEntitlement) {
      await db
        .update(userEntitlements)
        .set({
          subscriptionId,
          startsAt,
          endsAt,
          sourceType: "order",
        })
        .where(eq(userEntitlements.id, existingVipEntitlement.id));
    } else {
      await db.insert(userEntitlements).values({
        userId: orderRow.userId,
        entitlementType: "vip",
        sourceType: "order",
        orderId: orderRow.id,
        subscriptionId,
        startsAt,
        endsAt,
      });
    }
    granted = true;
  }

  const nextOrderUpdate: Record<string, any> = {
    benefitsGrantedAt: orderRow.benefitsGrantedAt ?? now,
  };

  if (opts?.isRepair) {
    nextOrderUpdate.benefitsRepairCount = sql`${orders.benefitsRepairCount} + 1` as any;
    nextOrderUpdate.lastBenefitRepairAt = now;
  }

  await db.update(orders).set(nextOrderUpdate).where(eq(orders.id, orderId));
  return { granted, subscriptionId };
}

async function revokeOrderBenefits(orderId: number, opts?: { isRepair?: boolean; reason?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [orderRow] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      courseId: orders.courseId,
      status: orders.status,
      benefitsRevokedAt: orders.benefitsRevokedAt,
      benefitsRevokeCount: orders.benefitsRevokeCount,
      product: {
        id: products.id,
        type: products.type,
        title: products.title,
      },
    })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) throw new Error("订单不存在");

  const now = new Date();
  let revoked = false;

  if (orderRow.courseId) {
    await db
      .update(userEntitlements)
      .set({ endsAt: now })
      .where(and(eq(userEntitlements.orderId, orderId), eq(userEntitlements.entitlementType, "course")));
    revoked = true;
  }

  if (orderRow.product?.type === "vip") {
    await db
      .update(userSubscriptions)
      .set({ status: "cancelled", endAt: now })
      .where(eq(userSubscriptions.orderId, orderId));
    await db
      .update(userEntitlements)
      .set({ endsAt: now })
      .where(and(eq(userEntitlements.orderId, orderId), eq(userEntitlements.entitlementType, "vip")));
    revoked = true;
  }

  const nextOrderUpdate: Record<string, any> = {
    benefitsRevokedAt: orderRow.benefitsRevokedAt ?? now,
  };
  if (opts?.isRepair) {
    nextOrderUpdate.benefitsRevokeCount = sql`${orders.benefitsRevokeCount} + 1` as any;
    nextOrderUpdate.lastBenefitRevokeAt = now;
  }
  await db.update(orders).set(nextOrderUpdate).where(eq(orders.id, orderId));
  return { revoked };
}

export async function refundOrder(
  orderId: number,
  opts?: {
    paymentMethod?: PaymentMethod;
    providerTradeNo?: string | null;
    refundAmountCents?: number | null;
    refundReason?: string | null;
    paymentPayload?: unknown;
    paymentCallbackAt?: Date | null;
    refundedAt?: Date | null;
    emitNotificationDedupSuffix?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [existing] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!existing) throw new Error("订单不存在");
  if (existing.status !== "paid" && existing.status !== "refunded") {
    throw new Error("只有已支付订单才能退款");
  }

  const now = opts?.refundedAt ?? new Date();
  await db
    .update(orders)
    .set({
      status: "refunded",
      paymentMethod: opts?.paymentMethod ?? existing.paymentMethod,
      providerTradeNo: opts?.providerTradeNo ?? existing.providerTradeNo,
      paymentCallbackAt: opts?.paymentCallbackAt ?? existing.paymentCallbackAt ?? now,
      paymentPayload: opts?.paymentPayload === undefined ? existing.paymentPayload : safeJsonStringify(opts.paymentPayload),
      refundedAt: now,
      refundAmountCents: Number(opts?.refundAmountCents ?? existing.refundAmountCents ?? existing.paidAmountCents ?? existing.amountCents),
      refundReason: opts?.refundReason ?? existing.refundReason ?? null,
    })
    .where(eq(orders.id, orderId));

  const needsRepair = existing.status === "refunded" && !existing.benefitsRevokedAt;
  const revokeResult = await revokeOrderBenefits(orderId, { isRepair: needsRepair, reason: opts?.refundReason });
  await markOrderPaymentSessions(orderId, "failed", { source: "refundOrder", refundReason: opts?.refundReason ?? null });
  const nextOrder = await getOrderById(orderId);
  if (nextOrder) {
    await emitPaymentNotifications({
      orderId,
      eventType: "payment_refunded",
      dedupeSuffix: opts?.emitNotificationDedupSuffix ?? String(nextOrder.refundedAt ?? now),
      payload: { refundAmountCents: nextOrder.refundAmountCents },
      reason: opts?.refundReason ?? null,
    });
    if (revokeResult?.revoked) {
      await emitPaymentNotifications({
        orderId,
        eventType: "benefits_revoked",
        dedupeSuffix: opts?.emitNotificationDedupSuffix ?? `${Number(nextOrder.benefitsRevokeCount ?? 0)}:${nextOrder.refundedAt ?? now}`,
        message: "退款后已自动回收订单权益",
        reason: opts?.refundReason ?? null,
      });
    }
  }
  return nextOrder;
}

export async function retryPaymentNotification(notificationId: number) {
  return dispatchPaymentNotificationById(notificationId, { force: true });
}

export async function listPaymentNotifications(opts: {
  status?: "pending" | "sent" | "failed" | "skipped" | "all";
  channel?: "log" | "owner" | "webhook" | "all";
  eventType?: PaymentNotificationEventType | "all";
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [] as any[];
  if (opts.status && opts.status !== "all") conditions.push(eq(paymentNotifications.status, opts.status));
  if (opts.channel && opts.channel !== "all") conditions.push(eq(paymentNotifications.channel, opts.channel));
  if (opts.eventType && opts.eventType !== "all") conditions.push(eq(paymentNotifications.eventType, opts.eventType));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select({
      id: paymentNotifications.id,
      eventKey: paymentNotifications.eventKey,
      eventType: paymentNotifications.eventType,
      channel: paymentNotifications.channel,
      relatedOrderId: paymentNotifications.relatedOrderId,
      title: paymentNotifications.title,
      content: paymentNotifications.content,
      recipient: paymentNotifications.recipient,
      status: paymentNotifications.status,
      attempts: paymentNotifications.attempts,
      lastAttemptAt: paymentNotifications.lastAttemptAt,
      sentAt: paymentNotifications.sentAt,
      lastError: paymentNotifications.lastError,
      createdAt: paymentNotifications.createdAt,
      updatedAt: paymentNotifications.updatedAt,
      order: {
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
      },
    })
    .from(paymentNotifications)
    .leftJoin(orders, eq(paymentNotifications.relatedOrderId, orders.id))
    .where(whereClause)
    .orderBy(desc(paymentNotifications.createdAt))
    .limit(opts.limit ?? 100);
}


export async function listUserNotifications(
  userId: number,
  opts: { status?: "unread" | "read" | "all"; limit?: number } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(userNotifications.userId, userId)] as any[];
  if (opts.status === "unread") {
    conditions.push(isNull(userNotifications.readAt));
  } else if (opts.status === "read") {
    conditions.push(sql`${userNotifications.readAt} is not null` as any);
  }
  return db
    .select({
      id: userNotifications.id,
      eventKey: userNotifications.eventKey,
      eventType: userNotifications.eventType,
      relatedOrderId: userNotifications.relatedOrderId,
      title: userNotifications.title,
      content: userNotifications.content,
      actionUrl: userNotifications.actionUrl,
      readAt: userNotifications.readAt,
      createdAt: userNotifications.createdAt,
      updatedAt: userNotifications.updatedAt,
      order: {
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        amountCents: orders.amountCents,
        productSnapshotTitle: orders.productSnapshotTitle,
      },
    })
    .from(userNotifications)
    .leftJoin(orders, eq(userNotifications.relatedOrderId, orders.id))
    .where(and(...conditions))
    .orderBy(desc(userNotifications.createdAt))
    .limit(opts.limit ?? 50);
}

export async function getUserNotificationLiveSnapshot(userId: number) {
  const [unreadCount, latestInbox, latestEmail] = await Promise.all([
    getUnreadUserNotificationCount(userId),
    listUserNotifications(userId, { limit: 1 }),
    listEmailDeliveriesByUser(userId, { limit: 1 }),
  ]);
  return {
    unreadCount,
    latestNotificationId: Number(latestInbox?.[0]?.id ?? 0),
    latestEmailId: Number(latestEmail?.[0]?.id ?? 0),
    serverTime: new Date().toISOString(),
  };
}

export async function getUnreadUserNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function markUserNotificationsRead(userId: number, input: { ids?: number[]; all?: boolean }) {
  const db = await getDb();
  if (!db) return { updated: 0 };
  const now = new Date();
  if (input.all) {
    await db
      .update(userNotifications)
      .set({ readAt: now })
      .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)));
  } else if (input.ids?.length) {
    await db
      .update(userNotifications)
      .set({ readAt: now })
      .where(and(eq(userNotifications.userId, userId), inArray(userNotifications.id, input.ids)));
  }
  const unreadCount = await getUnreadUserNotificationCount(userId);
  return { success: true, unreadCount };
}

export async function listEmailDeliveriesByUser(userId: number, opts: { limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: emailDeliveries.id,
      eventKey: emailDeliveries.eventKey,
      eventType: emailDeliveries.eventType,
      provider: emailDeliveries.provider,
      recipientEmail: emailDeliveries.recipientEmail,
      subject: emailDeliveries.subject,
      contentText: emailDeliveries.contentText,
      status: emailDeliveries.status,
      attempts: emailDeliveries.attempts,
      lastAttemptAt: emailDeliveries.lastAttemptAt,
      sentAt: emailDeliveries.sentAt,
      lastError: emailDeliveries.lastError,
      createdAt: emailDeliveries.createdAt,
      updatedAt: emailDeliveries.updatedAt,
      order: {
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
      },
    })
    .from(emailDeliveries)
    .leftJoin(orders, eq(emailDeliveries.relatedOrderId, orders.id))
    .where(eq(emailDeliveries.userId, userId))
    .orderBy(desc(emailDeliveries.createdAt))
    .limit(opts.limit ?? 50);
}

type PaymentMethod = "mock" | "manual" | "wechat" | "alipay";
type PaymentCallbackProvider = "wechat" | "alipay" | "custom" | "manual";
type PaymentCallbackStatus = "paid" | "failed" | "cancelled" | "refunded";
type PaymentCallbackResultStatus = "received" | "applied" | "duplicate" | "rejected" | "ignored" | "error";

function mapProviderToPaymentMethod(provider: PaymentCallbackProvider): PaymentMethod {
  if (provider === "wechat" || provider === "alipay") return provider;
  return "manual";
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "Unable to stringify payload" });
  }
}

type PaymentNotificationEventType = "payment_paid" | "payment_failed" | "payment_cancelled" | "payment_refunded" | "benefits_repaired" | "benefits_revoked";
type PaymentNotificationChannel = "log" | "owner" | "webhook";
type PaymentNotificationStatus = "pending" | "sent" | "failed" | "skipped";

function formatPriceCents(amount?: number | null) {
  return `¥${((Number(amount ?? 0)) / 100).toFixed(2)}`;
}

function buildPaymentNotificationTitle(eventType: PaymentNotificationEventType, order: Awaited<ReturnType<typeof getOrderById>>) {
  const itemName = order?.productSnapshotTitle ?? order?.course?.title ?? order?.product?.title ?? "订单";
  const orderNo = order?.orderNo ?? "";
  switch (eventType) {
    case "payment_paid":
      return `支付成功 · ${itemName} · ${orderNo}`;
    case "payment_failed":
      return `支付失败回调 · ${itemName} · ${orderNo}`;
    case "payment_cancelled":
      return `订单已取消 · ${itemName} · ${orderNo}`;
    case "payment_refunded":
      return `订单已退款 · ${itemName} · ${orderNo}`;
    case "benefits_repaired":
      return `权益已补发 · ${itemName} · ${orderNo}`;
    case "benefits_revoked":
      return `权益已回收 · ${itemName} · ${orderNo}`;
    default:
      return `支付通知 · ${itemName} · ${orderNo}`;
  }
}

function buildPaymentNotificationContent(eventType: PaymentNotificationEventType, order: Awaited<ReturnType<typeof getOrderById>>, extra?: Record<string, unknown>) {
  const lines = [
    `订单号：${order?.orderNo ?? "-"}`,
    `商品：${order?.productSnapshotTitle ?? order?.product?.title ?? order?.course?.title ?? "-"}`,
    `用户：${order?.user?.name ?? "匿名用户"}${order?.user?.email ? ` (${order.user.email})` : ""}`,
    `金额：${formatPriceCents(eventType === "payment_refunded" ? (extra?.refundAmountCents as number | null | undefined) ?? order?.refundAmountCents ?? order?.paidAmountCents ?? order?.amountCents : order?.paidAmountCents ?? order?.amountCents)}`,
    `状态：${order?.status ?? "-"}`,
  ];
  if (order?.providerTradeNo) lines.push(`渠道单号：${order.providerTradeNo}`);
  if (extra?.message) lines.push(`说明：${String(extra.message)}`);
  if (extra?.reason) lines.push(`原因：${String(extra.reason)}`);
  if (eventType === "benefits_repaired") lines.push(`补发次数：${Number(order?.benefitsRepairCount ?? 0)}`);
  if (eventType === "benefits_revoked") lines.push(`回收次数：${Number(order?.benefitsRevokeCount ?? 0)}`);
  if (eventType === "payment_refunded") lines.push(`退款时间：${order?.refundedAt ? new Date(order.refundedAt).toLocaleString("zh-CN") : new Date().toLocaleString("zh-CN")}`);
  return lines.join("\n");
}

function buildUserNotificationActionUrl(eventType: PaymentNotificationEventType, order: Awaited<ReturnType<typeof getOrderById>>) {
  const base = eventType === "payment_paid" || eventType === "benefits_repaired"
    ? "/payment/success"
    : eventType === "payment_refunded" || eventType === "benefits_revoked"
      ? "/payment/refunded"
      : "/payment/failed";
  const params = new URLSearchParams();
  if (order?.orderNo) params.set("orderNo", order.orderNo);
  if (order?.paymentMethod) params.set("provider", order.paymentMethod);
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}`;
}

function buildPaymentEmailHtml(title: string, content: string, actionUrl?: string | null) {
  const escapedTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedLines = content
    .split("\n")
    .map((line) => `<p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.7;">${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
  const button = actionUrl
    ? `<div style="margin-top:24px;"><a href="${actionUrl}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">查看订单详情</a></div>`
    : "";
  return `<div style="font-family:Inter,Arial,sans-serif;padding:24px;background:#f8fafc;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:24px;"><h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#0f172a;">${escapedTitle}</h1>${escapedLines}${button}<p style="margin:28px 0 0;color:#94a3b8;font-size:12px;">这是一封由 LearnFlow 支付消息中心生成的通知邮件。</p></div></div>`;
}


function buildPaymentNotificationChannels(): Array<{ channel: PaymentNotificationChannel; recipient: string | null }> {
  const channels: Array<{ channel: PaymentNotificationChannel; recipient: string | null }> = [{ channel: "log", recipient: "payment-center" }];
  if (ENV.paymentNotifyOwner) {
    channels.push({ channel: "owner", recipient: "owner" });
  }
  if (ENV.paymentNotificationWebhookUrl) {
    channels.push({ channel: "webhook", recipient: ENV.paymentNotificationWebhookUrl });
  }
  return channels;
}

async function dispatchPaymentNotificationById(notificationId: number, opts?: { force?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .select()
    .from(paymentNotifications)
    .where(eq(paymentNotifications.id, notificationId))
    .limit(1);
  if (!row) throw new Error("通知记录不存在");
  if (!opts?.force && row.status === "sent") return row;

  let payload: unknown = null;
  try {
    payload = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    payload = row.payload;
  }

  const result = await dispatchPaymentNotificationDelivery({
    channel: row.channel as PaymentNotificationChannel,
    eventType: row.eventType,
    title: row.title,
    content: row.content,
    payload,
  });

  const status: PaymentNotificationStatus = result.skipped ? "skipped" : result.ok ? "sent" : "failed";
  await db
    .update(paymentNotifications)
    .set({
      status,
      attempts: sql`${paymentNotifications.attempts} + 1` as any,
      lastAttemptAt: new Date(),
      sentAt: status === "sent" ? new Date() : row.sentAt,
      lastError: result.ok ? null : result.message,
    })
    .where(eq(paymentNotifications.id, notificationId));

  const [updated] = await db.select().from(paymentNotifications).where(eq(paymentNotifications.id, notificationId)).limit(1);
  return updated ?? row;
}

async function dispatchEmailDeliveryById(emailDeliveryId: number, opts?: { force?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(emailDeliveries).where(eq(emailDeliveries.id, emailDeliveryId)).limit(1);
  if (!row) throw new Error("邮件投递记录不存在");
  if (!opts?.force && row.status === "sent") return row;

  let payload: unknown = null;
  try {
    payload = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    payload = row.payload;
  }

  const result = await dispatchEmailDelivery({
    to: row.recipientEmail,
    subject: row.subject,
    text: row.contentText,
    html: row.contentHtml,
    payload,
    eventType: row.eventType,
  });
  const status = result.skipped ? "skipped" : result.ok ? "sent" : "failed";

  await db
    .update(emailDeliveries)
    .set({
      provider: result.provider,
      status,
      attempts: sql`${emailDeliveries.attempts} + 1` as any,
      lastAttemptAt: new Date(),
      sentAt: status === "sent" ? new Date() : row.sentAt,
      lastError: result.ok ? (result.skipped ? result.message : null) : result.message,
    })
    .where(eq(emailDeliveries.id, emailDeliveryId));

  const [updated] = await db.select().from(emailDeliveries).where(eq(emailDeliveries.id, emailDeliveryId)).limit(1);
  return updated ?? row;
}

async function emitUserInboxAndEmailNotifications(input: {
  orderId: number;
  eventType: PaymentNotificationEventType;
  dedupeSuffix?: string;
  payload?: Record<string, unknown>;
  message?: string;
  reason?: string | null;
}) {
  const db = await getDb();
  if (!db) return { inbox: [], emails: [] };
  const order = await getOrderById(input.orderId);
  if (!order) return { inbox: [], emails: [] };

  const title = buildPaymentNotificationTitle(input.eventType, order);
  const content = buildPaymentNotificationContent(input.eventType, order, {
    ...input.payload,
    message: input.message,
    reason: input.reason,
  });
  const actionUrl = buildUserNotificationActionUrl(input.eventType, order);
  const dedupeSuffix = input.dedupeSuffix ?? "default";

  const inboxKey = `${input.eventType}:${order.orderNo}:user:${dedupeSuffix}`;
  const [existingInbox] = await db.select({ id: userNotifications.id }).from(userNotifications).where(eq(userNotifications.eventKey, inboxKey)).limit(1);
  if (!existingInbox) {
    await db.insert(userNotifications).values({
      eventKey: inboxKey,
      userId: order.userId,
      eventType: input.eventType,
      relatedOrderId: order.id,
      title,
      content,
      actionUrl,
    });
  }

  const recipientEmail = order.user?.email?.trim() || null;
  const emailKey = `${input.eventType}:${order.orderNo}:email:${dedupeSuffix}`;
  const [existingEmail] = await db.select({ id: emailDeliveries.id }).from(emailDeliveries).where(eq(emailDeliveries.eventKey, emailKey)).limit(1);
  let emailRecordId = existingEmail?.id ?? null;
  if (!existingEmail) {
    await db.insert(emailDeliveries).values({
      eventKey: emailKey,
      eventType: input.eventType,
      userId: order.userId,
      relatedOrderId: order.id,
      provider: resolveEmailProvider(),
      recipientEmail,
      subject: title,
      contentText: content,
      contentHtml: buildPaymentEmailHtml(title, content, actionUrl),
      payload: safeJsonStringify({
        orderId: order.id,
        orderNo: order.orderNo,
        eventType: input.eventType,
        actionUrl,
        ...input.payload,
      }),
      status: "pending",
    });
    const [createdEmail] = await db.select({ id: emailDeliveries.id }).from(emailDeliveries).where(eq(emailDeliveries.eventKey, emailKey)).limit(1);
    emailRecordId = createdEmail?.id ?? null;
  }

  let emailRow = null;
  if (emailRecordId) {
    emailRow = await dispatchEmailDeliveryById(emailRecordId);
  }

  const inboxRows = await db
    .select()
    .from(userNotifications)
    .where(eq(userNotifications.eventKey, inboxKey))
    .limit(1);

  return { inbox: inboxRows, emails: emailRow ? [emailRow] : [] };
}

async function emitPaymentNotifications(input: {
  orderId: number;
  eventType: PaymentNotificationEventType;
  dedupeSuffix?: string;
  payload?: Record<string, unknown>;
  message?: string;
  reason?: string | null;
}) {
  const db = await getDb();
  if (!db) return [];
  const order = await getOrderById(input.orderId);
  if (!order) return [];

  const title = buildPaymentNotificationTitle(input.eventType, order);
  const content = buildPaymentNotificationContent(input.eventType, order, {
    ...input.payload,
    message: input.message,
    reason: input.reason,
  });
  const basePayload = {
    eventType: input.eventType,
    orderId: order.id,
    orderNo: order.orderNo,
    status: order.status,
    productId: order.productId,
    courseId: order.courseId,
    userId: order.userId,
    amountCents: order.amountCents,
    paidAmountCents: order.paidAmountCents,
    refundAmountCents: order.refundAmountCents,
    paymentMethod: order.paymentMethod,
    providerTradeNo: order.providerTradeNo,
    ...input.payload,
  };

  const createdIds: number[] = [];
  for (const target of buildPaymentNotificationChannels()) {
    const dedupeKey = `${input.eventType}:${order.orderNo}:${target.channel}:${input.dedupeSuffix ?? "default"}`;
    const [existing] = await db
      .select({ id: paymentNotifications.id })
      .from(paymentNotifications)
      .where(eq(paymentNotifications.eventKey, dedupeKey))
      .limit(1);
    if (existing) {
      createdIds.push(existing.id);
      continue;
    }
    await db.insert(paymentNotifications).values({
      eventKey: dedupeKey,
      eventType: input.eventType,
      channel: target.channel,
      relatedOrderId: order.id,
      title,
      content,
      recipient: target.recipient,
      payload: safeJsonStringify(basePayload),
      status: "pending",
    });
    const [created] = await db
      .select({ id: paymentNotifications.id })
      .from(paymentNotifications)
      .where(eq(paymentNotifications.eventKey, dedupeKey))
      .limit(1);
    if (created) createdIds.push(created.id);
  }

  const dispatched = [];
  for (const id of createdIds) {
    dispatched.push(await dispatchPaymentNotificationById(id));
  }
  await emitUserInboxAndEmailNotifications(input);
  return dispatched;
}

function buildPaymentCallbackKey(input: {
  provider: PaymentCallbackProvider;
  callbackKey?: string;
  eventId?: string | null;
  orderNo: string;
  providerTradeNo?: string | null;
  amountCents?: number | null;
  status: PaymentCallbackStatus;
}) {
  return (
    input.callbackKey ||
    input.eventId ||
    `${input.provider}:${input.orderNo}:${input.providerTradeNo ?? ""}:${input.status}:${input.amountCents ?? 0}`
  );
}

export async function getMyAccessSummary(userId: number) {
  const db = await getDb();
  if (!db) return { hasVip: false, vipExpiresAt: null, entitledCourseIds: [] as number[] };

  const subscriptions = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.endAt), desc(userSubscriptions.createdAt));

  const activeSubscription = subscriptions.find(
    (item) => item.status === "active" && (!item.endAt || isFutureDate(item.endAt))
  );

  const entitlementRows = await db
    .select({
      id: userEntitlements.id,
      entitlementType: userEntitlements.entitlementType,
      courseId: userEntitlements.courseId,
      startsAt: userEntitlements.startsAt,
      endsAt: userEntitlements.endsAt,
    })
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
    .orderBy(desc(userEntitlements.createdAt));

  const entitledCourseIds = Array.from(
    new Set(
      entitlementRows
        .filter(
          (item) =>
            item.entitlementType === "course" &&
            item.courseId &&
            (!item.endsAt || isFutureDate(item.endsAt))
        )
        .map((item) => Number(item.courseId))
    )
  );

  return {
    hasVip: Boolean(activeSubscription),
    vipExpiresAt: activeSubscription?.endAt ?? null,
    vipPlanName: activeSubscription?.planName ?? null,
    entitledCourseIds,
    subscription: activeSubscription ?? null,
  };
}

export async function createOrder(userId: number, productId: number, opts?: { idempotencyKey?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const product = await getProductById(productId);
  if (!product || product.status !== "active") {
    throw new Error("商品不存在或未上架");
  }

  const access = await getMyAccessSummary(userId);
  if (product.type === "course" && product.courseId && access.entitledCourseIds.includes(product.courseId)) {
    throw new Error("你已经拥有这门课程了");
  }
  if (product.type === "vip" && access.hasVip) {
    throw new Error("当前账号已经拥有有效会员");
  }

  if (opts?.idempotencyKey) {
    const [sameKeyOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, opts.idempotencyKey)))
      .limit(1);
    if (sameKeyOrder) {
      return getOrderById(sameKeyOrder.id);
    }
  }

  const [pendingOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.productId, product.id), eq(orders.status, "pending")))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (pendingOrder) {
    return getOrderById(pendingOrder.id);
  }

  const orderNo = generateOrderNo();
  await db.insert(orders).values({
    orderNo,
    userId,
    productId: product.id,
    courseId: product.courseId ?? null,
    productSnapshotTitle: product.title,
    amountCents: product.priceCents,
    idempotencyKey: opts?.idempotencyKey ?? null,
    status: "pending",
    paymentMethod: "mock",
  });

  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNo, orderNo)).limit(1);
  return row ? getOrderById(row.id) : null;
}

export async function getOrderByOrderNo(orderNo: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNo, orderNo))
    .limit(1);
  return row ? getOrderById(row.id) : null;
}

export async function getOrderById(orderId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      userId: orders.userId,
      productId: orders.productId,
      courseId: orders.courseId,
      productSnapshotTitle: orders.productSnapshotTitle,
      amountCents: orders.amountCents,
      idempotencyKey: orders.idempotencyKey,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      providerTradeNo: orders.providerTradeNo,
      paidAmountCents: orders.paidAmountCents,
      paymentCallbackAt: orders.paymentCallbackAt,
      paymentPayload: orders.paymentPayload,
      refundedAt: orders.refundedAt,
      refundAmountCents: orders.refundAmountCents,
      refundReason: orders.refundReason,
      benefitsGrantedAt: orders.benefitsGrantedAt,
      benefitsRepairCount: orders.benefitsRepairCount,
      lastBenefitRepairAt: orders.lastBenefitRepairAt,
      benefitsRevokedAt: orders.benefitsRevokedAt,
      benefitsRevokeCount: orders.benefitsRevokeCount,
      lastBenefitRevokeAt: orders.lastBenefitRevokeAt,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      product: {
        id: products.id,
        type: products.type,
        title: products.title,
        durationDays: products.durationDays,
      },
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
      },
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(courses, eq(orders.courseId, courses.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  return row ?? null;
}


type PaymentSessionProvider = "mock" | "manual" | "wechat" | "alipay";
type PaymentSessionChannel = "native" | "page" | "jsapi" | "wap" | "manual";
type PaymentSessionStatus = "created" | "awaiting_action" | "pending_callback" | "paid" | "failed" | "cancelled" | "expired";

export async function getPaymentSessionByToken(checkoutToken: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: paymentSessions.id,
      orderId: paymentSessions.orderId,
      provider: paymentSessions.provider,
      channel: paymentSessions.channel,
      status: paymentSessions.status,
      providerSessionId: paymentSessions.providerSessionId,
      checkoutToken: paymentSessions.checkoutToken,
      redirectUrl: paymentSessions.redirectUrl,
      codeUrl: paymentSessions.codeUrl,
      displayContent: paymentSessions.displayContent,
      expiresAt: paymentSessions.expiresAt,
      requestPayload: paymentSessions.requestPayload,
      responsePayload: paymentSessions.responsePayload,
      createdAt: paymentSessions.createdAt,
      updatedAt: paymentSessions.updatedAt,
      order: {
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        amountCents: orders.amountCents,
        productSnapshotTitle: orders.productSnapshotTitle,
      },
    })
    .from(paymentSessions)
    .leftJoin(orders, eq(paymentSessions.orderId, orders.id))
    .where(eq(paymentSessions.checkoutToken, checkoutToken))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    requestPayload: parseJsonText(row.requestPayload),
    responsePayload: parseJsonText(row.responsePayload),
  };
}

export async function getCheckoutStatusForUser(
  userId: number,
  input: { orderId?: number; orderNo?: string; checkoutToken?: string }
) {
  let requestedSession: Awaited<ReturnType<typeof getPaymentSessionByToken>> | Awaited<ReturnType<typeof listPaymentSessionsByOrder>>[number] | null =
    input.checkoutToken ? await getPaymentSessionByToken(input.checkoutToken) : null;
  let order = requestedSession?.orderId
    ? await getOrderById(requestedSession.orderId)
    : input.orderId
      ? await getOrderById(input.orderId)
      : input.orderNo
        ? await getOrderByOrderNo(input.orderNo)
        : null;

  if (!order || order.userId !== userId) {
    return null;
  }

  let sessions = await listPaymentSessionsByOrder(order.id, 5);
  if (!requestedSession && input.checkoutToken) {
    requestedSession = sessions.find((item) => item.checkoutToken === input.checkoutToken) ?? null;
  }
  const latestSession = requestedSession ?? sessions[0] ?? null;

  const pendingStatuses = new Set(["created", "awaiting_action", "pending_callback"]);
  if (latestSession?.expiresAt && pendingStatuses.has(String(latestSession.status))) {
    const expired = new Date(latestSession.expiresAt).getTime() < Date.now();
    if (expired) {
      await updatePaymentSession(latestSession.id, {
        status: "expired",
        responsePayload: {
          ...(latestSession.responsePayload && typeof latestSession.responsePayload === "object" ? latestSession.responsePayload : {}),
          system: "expired-by-status-query",
          checkedAt: new Date().toISOString(),
        },
      });
      sessions = await listPaymentSessionsByOrder(order.id, 5);
      order = await getOrderById(order.id);
      if (!order) return null;
      requestedSession = input.checkoutToken ? sessions.find((item) => item.checkoutToken === input.checkoutToken) ?? requestedSession : requestedSession;
    }
  }

  const activeSession = requestedSession ?? sessions[0] ?? null;
  const callbacks = await listPaymentCallbacks({ orderId: order.id, limit: 3 });
  const canRetry = order.status === "pending";
  const shouldPoll = order.status === "pending" && Boolean(activeSession) && String(activeSession?.status) !== "expired";

  return {
    order,
    session: activeSession,
    sessions,
    callbacks,
    canRetry,
    shouldPoll,
  };
}

export async function listPaymentSessionsByOrder(orderId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: paymentSessions.id,
      orderId: paymentSessions.orderId,
      provider: paymentSessions.provider,
      channel: paymentSessions.channel,
      status: paymentSessions.status,
      providerSessionId: paymentSessions.providerSessionId,
      checkoutToken: paymentSessions.checkoutToken,
      redirectUrl: paymentSessions.redirectUrl,
      codeUrl: paymentSessions.codeUrl,
      displayContent: paymentSessions.displayContent,
      expiresAt: paymentSessions.expiresAt,
      requestPayload: paymentSessions.requestPayload,
      responsePayload: paymentSessions.responsePayload,
      createdAt: paymentSessions.createdAt,
      updatedAt: paymentSessions.updatedAt,
    })
    .from(paymentSessions)
    .where(eq(paymentSessions.orderId, orderId))
    .orderBy(desc(paymentSessions.createdAt), desc(paymentSessions.id))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    requestPayload: parseJsonText(row.requestPayload),
    responsePayload: parseJsonText(row.responsePayload),
  }));
}

export async function createPaymentSession(
  orderId: number,
  data: {
    provider: PaymentSessionProvider;
    channel: PaymentSessionChannel;
    status?: PaymentSessionStatus;
    providerSessionId?: string | null;
    checkoutToken: string;
    redirectUrl?: string | null;
    codeUrl?: string | null;
    displayContent?: string | null;
    expiresAt?: Date | null;
    requestPayload?: unknown;
    responsePayload?: unknown;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const values: InsertPaymentSession = {
    orderId,
    provider: data.provider,
    channel: data.channel,
    status: data.status ?? "created",
    providerSessionId: data.providerSessionId ?? null,
    checkoutToken: data.checkoutToken,
    redirectUrl: data.redirectUrl ?? null,
    codeUrl: data.codeUrl ?? null,
    displayContent: data.displayContent ?? null,
    expiresAt: data.expiresAt ?? null,
    requestPayload: stringifyJson(data.requestPayload),
    responsePayload: stringifyJson(data.responsePayload),
  };
  await db.insert(paymentSessions).values(values);
  return getPaymentSessionByToken(data.checkoutToken);
}

export async function updatePaymentSession(
  id: number,
  data: Partial<{
    providerSessionId: string | null;
    status: PaymentSessionStatus;
    redirectUrl: string | null;
    codeUrl: string | null;
    displayContent: string | null;
    expiresAt: Date | null;
    requestPayload: unknown;
    responsePayload: unknown;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = {};
  if (data.providerSessionId !== undefined) updateData.providerSessionId = data.providerSessionId;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.redirectUrl !== undefined) updateData.redirectUrl = data.redirectUrl;
  if (data.codeUrl !== undefined) updateData.codeUrl = data.codeUrl;
  if (data.displayContent !== undefined) updateData.displayContent = data.displayContent;
  if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
  if (data.requestPayload !== undefined) updateData.requestPayload = stringifyJson(data.requestPayload);
  if (data.responsePayload !== undefined) updateData.responsePayload = stringifyJson(data.responsePayload);
  if (Object.keys(updateData).length === 0) {
    const [row] = await db.select().from(paymentSessions).where(eq(paymentSessions.id, id)).limit(1);
    return row ?? null;
  }
  await db.update(paymentSessions).set(updateData as any).where(eq(paymentSessions.id, id));
  const [row] = await db.select().from(paymentSessions).where(eq(paymentSessions.id, id)).limit(1);
  return row ?? null;
}

export async function setOrderPaymentMethod(orderId: number, paymentMethod: PaymentMethod) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(orders).set({ paymentMethod }).where(eq(orders.id, orderId));
  return getOrderById(orderId);
}

async function markOrderPaymentSessions(
  orderId: number,
  status: PaymentSessionStatus,
  payload?: unknown,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(paymentSessions)
    .set({ status, responsePayload: stringifyJson(payload) } as any)
    .where(
      and(
        eq(paymentSessions.orderId, orderId),
        or(
          eq(paymentSessions.status, "created"),
          eq(paymentSessions.status, "awaiting_action"),
          eq(paymentSessions.status, "pending_callback")
        )
      )
    );
}

export async function markOrderPaid(
  orderId: number,
  paymentMethod: PaymentMethod = "manual",
  opts?: {
    providerTradeNo?: string | null;
    paymentPayload?: unknown;
    paidAmountCents?: number | null;
    paymentCallbackAt?: Date | null;
    paidAt?: Date | null;
    forceRepairIfPaid?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [existing] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!existing) throw new Error("订单不存在");

  if (existing.status === "paid") {
    if (opts?.providerTradeNo || opts?.paymentPayload || opts?.paymentCallbackAt || opts?.paidAmountCents) {
      await db
        .update(orders)
        .set({
          providerTradeNo: opts?.providerTradeNo ?? existing.providerTradeNo,
          paymentPayload: opts?.paymentPayload === undefined ? existing.paymentPayload : safeJsonStringify(opts.paymentPayload),
          paymentCallbackAt: opts?.paymentCallbackAt ?? existing.paymentCallbackAt,
          paidAmountCents: Number(opts?.paidAmountCents ?? existing.paidAmountCents ?? existing.amountCents),
        })
        .where(eq(orders.id, orderId));
    }
    await markOrderPaymentSessions(orderId, "paid", { source: "repeat-paid", providerTradeNo: opts?.providerTradeNo ?? existing.providerTradeNo ?? null });
    if (opts?.forceRepairIfPaid || !existing.benefitsGrantedAt) {
      await ensureOrderBenefits(orderId, { isRepair: true });
      await emitPaymentNotifications({
        orderId,
        eventType: "benefits_repaired",
        dedupeSuffix: `${existing.benefitsRepairCount ?? 0}:${opts?.providerTradeNo ?? existing.providerTradeNo ?? "repair"}`,
        message: "重复支付回调触发了权益自检 / 补发",
      });
    }
    return getOrderById(orderId);
  }

  if (existing.status !== "pending") {
    throw new Error("当前订单状态不可支付");
  }

  await db
    .update(orders)
    .set({
      status: "paid",
      paymentMethod,
      providerTradeNo: opts?.providerTradeNo ?? null,
      paidAmountCents: Number(opts?.paidAmountCents ?? existing.amountCents),
      paymentCallbackAt: opts?.paymentCallbackAt ?? null,
      paymentPayload: opts?.paymentPayload === undefined ? null : safeJsonStringify(opts.paymentPayload),
      paidAt: opts?.paidAt ?? new Date(),
    })
    .where(eq(orders.id, orderId));
  await ensureOrderBenefits(orderId);
  await markOrderPaymentSessions(orderId, "paid", { source: "markOrderPaid", providerTradeNo: opts?.providerTradeNo ?? null });
  const nextOrder = await getOrderById(orderId);
  await emitPaymentNotifications({
    orderId,
    eventType: "payment_paid",
    dedupeSuffix: opts?.providerTradeNo ?? String(nextOrder?.paidAt ?? new Date()),
  });
  return nextOrder;
}

export async function payOrderByMock(orderId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!order) throw new Error("订单不存在");
  return markOrderPaid(orderId, "mock", {
    paidAmountCents: order.amountCents,
    paymentPayload: { source: "mock" },
    paidAt: new Date(),
  });
}

export async function cancelOrder(orderId: number, opts?: { userId?: number; admin?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const conditions = [eq(orders.id, orderId)] as any[];
  if (!opts?.admin && opts?.userId) {
    conditions.push(eq(orders.userId, opts.userId));
  }
  const [order] = await db.select().from(orders).where(and(...conditions)).limit(1);
  if (!order) throw new Error("订单不存在");
  if (order.status !== "pending") throw new Error("只有待支付订单可取消");
  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));
  await markOrderPaymentSessions(orderId, "cancelled", { source: "cancelOrder" });
  const nextOrder = await getOrderById(orderId);
  await emitPaymentNotifications({ orderId, eventType: "payment_cancelled", dedupeSuffix: String(nextOrder?.updatedAt ?? new Date()) });
  return nextOrder;
}

export async function listOrdersByUser(
  userId: number,
  opts: { status?: "pending" | "paid" | "cancelled" | "refunded" | "all"; limit?: number } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(orders.userId, userId)] as any[];
  if (opts.status && opts.status !== "all") {
    conditions.push(eq(orders.status, opts.status));
  }
  return db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      userId: orders.userId,
      productId: orders.productId,
      courseId: orders.courseId,
      productSnapshotTitle: orders.productSnapshotTitle,
      amountCents: orders.amountCents,
      idempotencyKey: orders.idempotencyKey,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      providerTradeNo: orders.providerTradeNo,
      paidAmountCents: orders.paidAmountCents,
      paymentCallbackAt: orders.paymentCallbackAt,
      refundedAt: orders.refundedAt,
      refundAmountCents: orders.refundAmountCents,
      refundReason: orders.refundReason,
      benefitsGrantedAt: orders.benefitsGrantedAt,
      benefitsRepairCount: orders.benefitsRepairCount,
      lastBenefitRepairAt: orders.lastBenefitRepairAt,
      benefitsRevokedAt: orders.benefitsRevokedAt,
      benefitsRevokeCount: orders.benefitsRevokeCount,
      lastBenefitRevokeAt: orders.lastBenefitRevokeAt,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      product: {
        id: products.id,
        type: products.type,
        title: products.title,
      },
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
      },
    })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(courses, eq(orders.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 20);
}

export async function listOrdersAdmin(
  opts: { status?: "pending" | "paid" | "cancelled" | "refunded" | "all"; limit?: number } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = opts.status && opts.status !== "all" ? eq(orders.status, opts.status) : undefined;
  return db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      userId: orders.userId,
      productId: orders.productId,
      courseId: orders.courseId,
      productSnapshotTitle: orders.productSnapshotTitle,
      amountCents: orders.amountCents,
      idempotencyKey: orders.idempotencyKey,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      providerTradeNo: orders.providerTradeNo,
      paidAmountCents: orders.paidAmountCents,
      paymentCallbackAt: orders.paymentCallbackAt,
      refundedAt: orders.refundedAt,
      refundAmountCents: orders.refundAmountCents,
      refundReason: orders.refundReason,
      benefitsGrantedAt: orders.benefitsGrantedAt,
      benefitsRepairCount: orders.benefitsRepairCount,
      lastBenefitRepairAt: orders.lastBenefitRepairAt,
      benefitsRevokedAt: orders.benefitsRevokedAt,
      benefitsRevokeCount: orders.benefitsRevokeCount,
      lastBenefitRevokeAt: orders.lastBenefitRevokeAt,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      product: {
        id: products.id,
        type: products.type,
        title: products.title,
      },
      course: {
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
      },
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(orders)
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(courses, eq(orders.courseId, courses.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(whereClause)
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 100);
}

export async function listPaymentCallbacks(opts: { orderId?: number; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const whereClause = opts.orderId ? eq(paymentCallbacks.relatedOrderId, opts.orderId) : undefined;
  return db
    .select({
      id: paymentCallbacks.id,
      provider: paymentCallbacks.provider,
      callbackKey: paymentCallbacks.callbackKey,
      eventId: paymentCallbacks.eventId,
      orderNo: paymentCallbacks.orderNo,
      relatedOrderId: paymentCallbacks.relatedOrderId,
      providerTradeNo: paymentCallbacks.providerTradeNo,
      amountCents: paymentCallbacks.amountCents,
      status: paymentCallbacks.status,
      signatureVerified: paymentCallbacks.signatureVerified,
      resultStatus: paymentCallbacks.resultStatus,
      resultMessage: paymentCallbacks.resultMessage,
      processedAt: paymentCallbacks.processedAt,
      createdAt: paymentCallbacks.createdAt,
      order: {
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
      },
    })
    .from(paymentCallbacks)
    .leftJoin(orders, eq(paymentCallbacks.relatedOrderId, orders.id))
    .where(whereClause)
    .orderBy(desc(paymentCallbacks.createdAt))
    .limit(opts.limit ?? 50);
}

export async function repairOrderBenefits(orderId: number) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("订单不存在");
  if (order.status !== "paid") throw new Error("只有已支付订单可以补发权益");
  const result = await ensureOrderBenefits(orderId, { isRepair: true });
  await emitPaymentNotifications({
    orderId,
    eventType: "benefits_repaired",
    dedupeSuffix: `${Number(order.benefitsRepairCount ?? 0) + 1}`,
    message: "管理员手动执行了权益补发",
  });
  return {
    order: await getOrderById(orderId),
    repair: result,
  };
}

export async function processPaymentCallback(input: {
  provider: PaymentCallbackProvider;
  orderNo: string;
  status: PaymentCallbackStatus;
  callbackKey?: string;
  eventId?: string | null;
  providerTradeNo?: string | null;
  amountCents?: number | null;
  signatureVerified: boolean;
  payload: unknown;
  paidAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const dbConn = db;

  const callbackKey = buildPaymentCallbackKey({
    provider: input.provider,
    callbackKey: input.callbackKey,
    eventId: input.eventId,
    orderNo: input.orderNo,
    providerTradeNo: input.providerTradeNo,
    amountCents: input.amountCents,
    status: input.status,
  });

  const [existingCallback] = await db
    .select()
    .from(paymentCallbacks)
    .where(eq(paymentCallbacks.callbackKey, callbackKey))
    .limit(1);
  if (existingCallback) {
    return {
      success: existingCallback.resultStatus === "applied" || existingCallback.resultStatus === "duplicate",
      duplicate: true,
      callback: existingCallback,
      order: existingCallback.relatedOrderId ? await getOrderById(existingCallback.relatedOrderId) : null,
    };
  }

  await dbConn.insert(paymentCallbacks).values({
    provider: input.provider,
    callbackKey,
    eventId: input.eventId ?? null,
    orderNo: input.orderNo,
    providerTradeNo: input.providerTradeNo ?? null,
    amountCents: Number(input.amountCents ?? 0),
    status: input.status,
    signatureVerified: input.signatureVerified,
    payload: safeJsonStringify(input.payload),
    resultStatus: "received",
  });

  async function finalize(resultStatus: PaymentCallbackResultStatus, resultMessage: string, relatedOrderId?: number | null) {
    await dbConn
      .update(paymentCallbacks)
      .set({
        relatedOrderId: relatedOrderId ?? null,
        resultStatus,
        resultMessage,
        processedAt: new Date(),
      })
      .where(eq(paymentCallbacks.callbackKey, callbackKey));

    const [callbackRow] = await dbConn
      .select()
      .from(paymentCallbacks)
      .where(eq(paymentCallbacks.callbackKey, callbackKey))
      .limit(1);
    return callbackRow ?? null;
  }

  if (!input.signatureVerified) {
    const callback = await finalize("rejected", "支付回调签名校验失败");
    return { success: false, duplicate: false, callback, order: null };
  }

  const order = await getOrderByOrderNo(input.orderNo);
  if (!order) {
    const callback = await finalize("rejected", "未找到对应订单");
    return { success: false, duplicate: false, callback, order: null };
  }

  if (input.status === "paid" && input.amountCents != null && Number(input.amountCents) !== Number(order.amountCents)) {
    const callback = await finalize("rejected", `支付金额不匹配：期望 ${order.amountCents}，收到 ${input.amountCents}`, order.id);
    return { success: false, duplicate: false, callback, order };
  }

  let nextOrder = order;
  let message = "回调已记录";
  let resultStatus: PaymentCallbackResultStatus = "ignored";

  if (input.status === "paid") {
    const paidOrder = await markOrderPaid(order.id, mapProviderToPaymentMethod(input.provider), {
      providerTradeNo: input.providerTradeNo ?? null,
      paymentPayload: input.payload,
      paidAmountCents: input.amountCents ?? order.amountCents,
      paymentCallbackAt: new Date(),
      paidAt: input.paidAt ?? new Date(),
      forceRepairIfPaid: true,
    });
    if (!paidOrder) throw new Error(`Order ${order.id} not found after mark paid`);
    nextOrder = paidOrder;
    message = order.status === "paid" ? "重复支付回调已幂等处理，并校验了权益" : "支付成功，订单已更新并发放权益";
    resultStatus = "applied";
  } else if (input.status === "cancelled") {
    if (order.status === "pending") {
      const cancelledOrder = await cancelOrder(order.id, { admin: true });
      if (!cancelledOrder) throw new Error(`Order ${order.id} not found after cancel`);
      nextOrder = cancelledOrder;
      message = "订单已根据回调取消";
      resultStatus = "applied";
    } else {
      message = "订单不是待支付状态，取消回调已忽略";
      resultStatus = "ignored";
    }
  } else if (input.status === "refunded") {
    const refundedOrder = await refundOrder(order.id, {
      paymentMethod: mapProviderToPaymentMethod(input.provider),
      providerTradeNo: input.providerTradeNo ?? order.providerTradeNo ?? null,
      refundAmountCents: input.amountCents ?? order.paidAmountCents ?? order.amountCents,
      refundReason: "支付渠道退款回调",
      paymentPayload: input.payload,
      paymentCallbackAt: new Date(),
      refundedAt: input.paidAt ?? new Date(),
      emitNotificationDedupSuffix: callbackKey,
    });
    if (!refundedOrder) throw new Error(`Order ${order.id} not found after refund`);
    nextOrder = refundedOrder;
    message = "订单已退款，权益已自动回收";
    resultStatus = "applied";
  } else {
    await dbConn
      .update(orders)
      .set({
        providerTradeNo: input.providerTradeNo ?? order.providerTradeNo ?? null,
        paymentCallbackAt: new Date(),
        paymentPayload: safeJsonStringify(input.payload),
      })
      .where(eq(orders.id, order.id));
    const refreshedOrder = await getOrderById(order.id);
    if (!refreshedOrder) throw new Error(`Order ${order.id} not found after callback update`);
    nextOrder = refreshedOrder;
    await markOrderPaymentSessions(order.id, "failed", { source: "callback", status: input.status });
    await emitPaymentNotifications({
      orderId: order.id,
      eventType: "payment_failed",
      dedupeSuffix: callbackKey,
      message: "???????????",
    });
    message = "?????????";
    resultStatus = "ignored";
  }

  const callback = await finalize(resultStatus, message, order.id);
  return { success: resultStatus === "applied", duplicate: false, callback, order: nextOrder };
}

export async function getMyCommerceOverview(userId: number) {
  const [access, ordersList] = await Promise.all([
    getMyAccessSummary(userId),
    listOrdersByUser(userId, { limit: 12 }),
  ]);
  return {
    access,
    orders: ordersList,
  };
}


type AdminAlertSeverity = "warn" | "critical";
type AdminAlertChannel = "log" | "inbox" | "email" | "webhook";
type AdminAlertStatus = "pending" | "sent" | "failed" | "skipped";

const CRITICAL_ADMIN_ACTIONS = new Set([
  "access.user.update",
  "commerce.order.refund",
  "commerce.order.mark_paid",
  "system.setting.clear",
  "system.snapshot.import",
  "system.snapshot.restore",
]);

const WARN_ADMIN_ACTIONS = new Set([
  "category.delete",
  "course.delete",
  "chapter.delete",
  "media.delete",
  "product.delete",
  "site.banner.delete",
  "commerce.order.cancel",
  "commerce.order.repair_benefits",
  "commerce.notification.retry",
]);

function resolveAdminAlertSeverity(row: { actionType: string; actionStatus: string | null | undefined }) : AdminAlertSeverity | null {
  if (row.actionStatus === "blocked") return "critical";
  if (row.actionStatus === "failed") return CRITICAL_ADMIN_ACTIONS.has(row.actionType) ? "critical" : "warn";
  if (CRITICAL_ADMIN_ACTIONS.has(row.actionType)) return "critical";
  if (WARN_ADMIN_ACTIONS.has(row.actionType)) return "warn";
  return null;
}

function buildAdminAlertActionUrl(row: { resourceType?: string | null; relatedOrderId?: number | null; actionType?: string | null }) {
  if (row.relatedOrderId) return `/admin/orders?orderId=${row.relatedOrderId}`;
  if (row.resourceType === "user") return "/admin/access";
  if (row.resourceType === "system_setting" || row.resourceType === "system_snapshot") return "/admin/system";
  if (row.resourceType === "payment_notification") return "/admin/payment-notifications";
  return "/admin/audit-alerts";
}

function buildAdminAlertTitle(row: any, severity: AdminAlertSeverity) {
  const prefix = severity === "critical" ? "高危后台操作告警" : "后台操作告警";
  return `${prefix} · ${row.actionLabel}`;
}

function buildAdminAlertContent(row: any, severity: AdminAlertSeverity) {
  const actor = row.actorUser?.name || row.actorUser?.email || row.actorUser?.openId || `用户#${row.actorUserId ?? "-"}`;
  const resource = row.resourceLabel || row.resourceId || row.resourceType || "未指定资源";
  const statusLabel = row.actionStatus === "blocked" ? "被拦截" : row.actionStatus === "failed" ? "执行失败" : "执行成功";
  const createdAt = row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN") : new Date().toLocaleString("zh-CN");
  const lines = [
    `级别：${severity === "critical" ? "高危" : "警告"}`,
    `状态：${statusLabel}`,
    `执行人：${actor}`,
    `动作：${row.actionLabel}（${row.actionType}）`,
    `资源：${resource}`,
    `时间：${createdAt}`,
  ];
  if (row.targetUser) lines.push(`目标用户：${row.targetUser.name || row.targetUser.email || row.targetUser.openId}`);
  if (row.relatedOrderId) lines.push(`关联订单：#${row.relatedOrderId}`);
  if (row.metadata) lines.push(`元数据：${JSON.stringify(row.metadata)}`);
  return lines.join("\n");
}

type AdminRiskStatus = "open" | "acknowledged" | "resolved";
type AdminRiskSlaStatus = "on_track" | "due_soon" | "breached" | "resolved";
type AdminRiskTriggerSeverity = "all" | "warn" | "critical";

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + Math.max(0, minutes) * 60_000);
}

function matchesRiskSeverity(expected: AdminRiskTriggerSeverity, actual?: string | null) {
  return expected === "all" || expected === (actual || "");
}

function computeIncidentSlaStatus(row: { status?: string | null; acknowledgedAt?: Date | string | null; ackDueAt?: Date | string | null; resolveDueAt?: Date | string | null }, soonMinutes = 15): AdminRiskSlaStatus {
  if (row.status === "resolved") return "resolved";
  const now = Date.now();
  const soonMs = Math.max(1, soonMinutes) * 60_000;
  const dueSource = row.acknowledgedAt ? row.resolveDueAt : row.ackDueAt;
  if (!dueSource) return "on_track";
  const dueTs = new Date(dueSource).getTime();
  if (Number.isNaN(dueTs)) return "on_track";
  if (now >= dueTs) return "breached";
  if (dueTs - now <= soonMs) return "due_soon";
  return "on_track";
}

function matchesRiskScope(input: { severity?: string | null; actionType?: string | null; resourceType?: string | null }, rule: { triggerSeverity?: string | null; actionType?: string | null; resourceType?: string | null }) {
  if (!matchesRiskSeverity((rule.triggerSeverity as AdminRiskTriggerSeverity) || "all", input.severity)) return false;
  if (rule.actionType && rule.actionType !== input.actionType) return false;
  if (rule.resourceType && rule.resourceType !== input.resourceType) return false;
  return true;
}

async function ensureDefaultAdminRiskSlaSetup() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: adminRiskSlaPolicies.id }).from(adminRiskSlaPolicies).limit(1);
  if (!existing.length) {
    await db.insert(adminRiskSlaPolicies).values([
      { name: "高危事件 SLA", triggerSeverity: "critical", acknowledgeMinutes: 10, resolveMinutes: 90, enabled: true } as any,
      { name: "一般事件 SLA", triggerSeverity: "warn", acknowledgeMinutes: 30, resolveMinutes: 240, enabled: true } as any,
    ]);
  }
}

async function chooseRiskSlaPolicy(incident: { severity?: string | null; actionType?: string | null; resourceType?: string | null }) {
  await ensureDefaultAdminRiskSlaSetup();
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(adminRiskSlaPolicies).where(eq(adminRiskSlaPolicies.enabled, true)).orderBy(desc(adminRiskSlaPolicies.triggerSeverity), desc(adminRiskSlaPolicies.actionType), desc(adminRiskSlaPolicies.resourceType), asc(adminRiskSlaPolicies.id));
  return rows.find((row) => matchesRiskScope(incident, row as any)) ?? rows[0] ?? null;
}

async function listAssignableRiskAdmins() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, adminLevel: users.adminLevel, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.role, "admin"));
  return rows.filter((row) => Boolean(getEffectiveAdminLevel(row as any, ENV.ownerOpenId))).sort((a, b) => new Date(b.lastSignedIn || 0).getTime() - new Date(a.lastSignedIn || 0).getTime());
}

async function chooseRiskIncidentOwner(incident: { severity?: string | null; actionType?: string | null; resourceType?: string | null }) {
  const db = await getDb();
  if (!db) return null;
  const roster = await db.select().from(adminRiskOncallAssignments).where(eq(adminRiskOncallAssignments.enabled, true)).orderBy(desc(adminRiskOncallAssignments.isPrimary), asc(adminRiskOncallAssignments.id));
  for (const row of roster) {
    if (matchesRiskScope(incident, row as any)) return row.userId;
  }
  const admins = await listAssignableRiskAdmins();
  return admins[0]?.id ?? null;
}

async function applySlaAndOwnerToIncident(incidentId: number) {
  const db = await getDb();
  if (!db) return null;
  const [incident] = await db.select({ id: adminRiskIncidents.id, severity: adminRiskIncidents.severity, status: adminRiskIncidents.status, actionType: adminActionAuditLogs.actionType, resourceType: adminActionAuditLogs.resourceType, ownerUserId: adminRiskIncidents.ownerUserId, acknowledgedAt: adminRiskIncidents.acknowledgedAt, createdAt: adminRiskIncidents.createdAt, ackDueAt: adminRiskIncidents.ackDueAt, resolveDueAt: adminRiskIncidents.resolveDueAt }).from(adminRiskIncidents).leftJoin(adminActionAuditLogs, eq(adminRiskIncidents.auditLogId, adminActionAuditLogs.id)).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  if (!incident) return null;
  const policy = await chooseRiskSlaPolicy(incident as any);
  const ownerUserId = incident.ownerUserId ?? await chooseRiskIncidentOwner(incident as any);
  const createdAt = new Date(incident.createdAt || new Date());
  const ackDueAt = policy ? addMinutes(createdAt, Number(policy.acknowledgeMinutes || 0)) : incident.ackDueAt ?? null;
  const resolveBase = incident.acknowledgedAt ? new Date(incident.acknowledgedAt) : createdAt;
  const resolveDueAt = policy ? addMinutes(resolveBase, Number(policy.resolveMinutes || 0)) : incident.resolveDueAt ?? null;
  const slaStatus = computeIncidentSlaStatus({ status: incident.status, acknowledgedAt: incident.acknowledgedAt, ackDueAt, resolveDueAt }, 15);
  await db.update(adminRiskIncidents).set({ ownerUserId: ownerUserId ?? null, ownerAssignedAt: ownerUserId && !incident.ownerUserId ? new Date() : undefined, ackDueAt, resolveDueAt, slaStatus }).where(eq(adminRiskIncidents.id, incidentId));
  const [updated] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  return updated ?? null;
}

async function refreshAdminRiskSlaStatuses() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: adminRiskIncidents.id, status: adminRiskIncidents.status, acknowledgedAt: adminRiskIncidents.acknowledgedAt, ackDueAt: adminRiskIncidents.ackDueAt, resolveDueAt: adminRiskIncidents.resolveDueAt, slaStatus: adminRiskIncidents.slaStatus }).from(adminRiskIncidents).where(inArray(adminRiskIncidents.status, ["open", "acknowledged", "resolved"] as any)).limit(200);
  const changed = [];
  for (const row of rows) {
    const next = computeIncidentSlaStatus(row as any, 15);
    if (next !== row.slaStatus) {
      await db.update(adminRiskIncidents).set({ slaStatus: next }).where(eq(adminRiskIncidents.id, row.id));
      changed.push(row.id);
    }
  }
  return changed;
}

function buildAdminRiskTitle(row: any, severity: AdminAlertSeverity) {
  return `${severity === "critical" ? "高危风险事件" : "风险事件"} · ${row.actionLabel}`;
}

function computeAdminRiskScore(row: { actionType: string; actionStatus?: string | null }, severity: AdminAlertSeverity) {
  let score = severity === "critical" ? 88 : 58;
  if (row.actionStatus === "blocked") score += 8;
  if (row.actionStatus === "failed") score += 6;
  if (row.actionType.startsWith("access.")) score += 6;
  if (row.actionType.includes("refund") || row.actionType.includes("system.") || row.actionType.includes("delete")) score += 4;
  return Math.min(100, score);
}

function buildAdminRiskSummary(row: any, severity: AdminAlertSeverity) {
  const base = buildAdminAlertContent(row, severity);
  return `${base}
建议：请尽快确认是否为预期操作，并在风险面板中确认、升级或关闭。`;
}

async function dispatchAdminRiskEscalationNotifications(incidentId: number, reason: string) {
  const db = await getDb();
  if (!db) return [];
  const [incident] = await db
    .select({
      id: adminRiskIncidents.id,
      auditLogId: adminRiskIncidents.auditLogId,
      severity: adminRiskIncidents.severity,
      escalationLevel: adminRiskIncidents.escalationLevel,
      slaStatus: adminRiskIncidents.slaStatus,
      title: adminRiskIncidents.title,
      summary: adminRiskIncidents.summary,
      status: adminRiskIncidents.status,
      relatedOrderId: adminActionAuditLogs.relatedOrderId,
    })
    .from(adminRiskIncidents)
    .leftJoin(adminRiskPlaybooks, eq(adminRiskIncidents.playbookId, adminRiskPlaybooks.id))
    .leftJoin(adminActionAuditLogs, eq(adminRiskIncidents.auditLogId, adminActionAuditLogs.id))
    .where(eq(adminRiskIncidents.id, incidentId))
    .limit(1);
  if (!incident) return [];

  const recipients = await listAdminAlertRecipients();
  const channelTargets: Array<{ channel: AdminAlertChannel; targetUserId?: number | null; recipient?: string | null }> = [{ channel: "log", recipient: null }];
  if (ENV.adminAlertInboxEnabled) {
    for (const recipient of recipients) channelTargets.push({ channel: "inbox", targetUserId: recipient.id, recipient: recipient.email ?? null });
  }
  if (ENV.adminAlertEmailEnabled) {
    for (const recipient of recipients) channelTargets.push({ channel: "email", targetUserId: recipient.id, recipient: recipient.email ?? null });
  }
  if ((ENV.adminAlertWebhookUrl || "").trim()) {
    channelTargets.push({ channel: "webhook", recipient: ENV.adminAlertWebhookUrl });
  }

  const createdIds: number[] = [];
  for (const target of channelTargets) {
    const eventKey = `admin-risk:${incident.id}:L${incident.escalationLevel}:${target.channel}:${target.targetUserId ?? "global"}`;
    const [existing] = await db.select({ id: adminAlertNotifications.id }).from(adminAlertNotifications).where(eq(adminAlertNotifications.eventKey, eventKey)).limit(1);
    if (existing) {
      createdIds.push(existing.id);
      continue;
    }
    await db.insert(adminAlertNotifications).values({
      eventKey,
      auditLogId: incident.auditLogId,
      actionType: "admin.risk.escalated",
      severity: incident.severity,
      channel: target.channel,
      targetUserId: target.targetUserId ?? null,
      relatedOrderId: incident.relatedOrderId ?? null,
      title: `风险事件升级 L${incident.escalationLevel} · ${incident.title}`,
      content: `${incident.summary || incident.title}

升级原因：${reason}`,
      actionUrl: `/admin/risk?incidentId=${incident.id}`,
      recipient: target.recipient ?? null,
      payload: safeJsonStringify({ incidentId: incident.id, escalationLevel: incident.escalationLevel, reason }),
      status: "pending",
    });
    const [created] = await db.select({ id: adminAlertNotifications.id }).from(adminAlertNotifications).where(eq(adminAlertNotifications.eventKey, eventKey)).limit(1);
    if (created) createdIds.push(created.id);
  }

  const results = [];
  for (const id of createdIds) results.push(await dispatchAdminAlertNotificationById(id));
  return results;
}

async function ensureAdminRiskIncidentForAudit(auditRow: any) {
  const db = await getDb();
  if (!db) return null;
  const severity = resolveAdminAlertSeverity(auditRow as any);
  if (!severity) return null;
  const riskScore = computeAdminRiskScore(auditRow as any, severity);
  const title = buildAdminRiskTitle(auditRow, severity);
  const summary = buildAdminRiskSummary(auditRow, severity);
  const payload = safeJsonStringify({
    auditLogId: auditRow.id,
    actionType: auditRow.actionType,
    actionStatus: auditRow.actionStatus,
    resourceType: auditRow.resourceType,
    resourceId: auditRow.resourceId,
    relatedOrderId: auditRow.relatedOrderId,
    metadata: auditRow.metadata ?? null,
  });
  const [existing] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.auditLogId, auditRow.id)).limit(1);
  if (existing) {
    await db.update(adminRiskIncidents).set({ severity, riskScore, title, summary, payload, lastSeenAt: new Date() }).where(eq(adminRiskIncidents.id, existing.id));
    await applySlaAndOwnerToIncident(existing.id);
    const [updated] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, existing.id)).limit(1);
    await applyAdminRiskAutomation(existing.id);
    return updated ?? existing;
  }
  const now = new Date();
  await db.insert(adminRiskIncidents).values({
    auditLogId: auditRow.id,
    severity,
    riskScore,
    status: "open",
    escalationLevel: severity === "critical" ? 1 : 0,
    title,
    summary,
    payload,
    firstSeenAt: now,
    lastSeenAt: now,
    lastEscalatedAt: severity === "critical" ? now : null,
  });
  const [created] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.auditLogId, auditRow.id)).limit(1);
  if (created?.id) {
    await applySlaAndOwnerToIncident(created.id);
    await applyAdminRiskAutomation(created.id);
  }
  return created ?? null;
}

export async function syncRecentAdminRiskIncidents(limit = 80) {
  const rows = await listAdminActionAuditLogs({ limit });
  for (const row of rows) {
    await ensureAdminRiskIncidentForAudit(row as any);
  }
}

export async function autoEscalateAdminRiskIncidents() {
  const db = await getDb();
  if (!db) return [];
  await refreshAdminRiskSlaStatuses();
  const openRows = await db.select().from(adminRiskIncidents).where(inArray(adminRiskIncidents.status, ["open", "acknowledged"] as any)).limit(100);
  const afterMinutes = Math.max(1, Number(ENV.adminRiskEscalateAfterMinutes ?? 10));
  const repeatMinutes = Math.max(afterMinutes, Number(ENV.adminRiskRepeatEscalateMinutes ?? 30));
  const now = Date.now();
  const escalatedIds: number[] = [];
  for (const row of openRows) {
    const baseCandidate: any = row.lastEscalatedAt || row.firstSeenAt || row.createdAt || new Date();
    const baseTime = new Date(baseCandidate).getTime();
    const waitMs = row.escalationLevel > 0 ? repeatMinutes * 60_000 : afterMinutes * 60_000;
    const breached = computeIncidentSlaStatus(row as any, 15) === "breached";
    const shouldEscalate = row.status !== "resolved" && (row.riskScore >= 80 || breached) && now - baseTime >= waitMs && row.escalationLevel < 3;
    if (!shouldEscalate) continue;
    const nextLevel = row.escalationLevel + 1;
    await db.update(adminRiskIncidents).set({ escalationLevel: nextLevel, lastEscalatedAt: new Date() }).where(eq(adminRiskIncidents.id, row.id));
    escalatedIds.push(row.id);
    await dispatchAdminRiskEscalationNotifications(row.id, row.escalationLevel > 0 ? "风险事件持续未处理，已继续升级" : "风险事件超时未处理，已升级告警");
  }
  return escalatedIds;
}

async function listAdminAlertRecipients() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      openId: users.openId,
      role: users.role,
      adminLevel: users.adminLevel,
    })
    .from(users)
    .where(eq(users.role, "admin"));
  const seen = new Set<number>();
  return rows.filter((row) => {
    const level = getEffectiveAdminLevel(row as any, ENV.ownerOpenId);
    if (!level) return false;
    if (!(level === "owner" || level === "manager")) return false;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function dispatchAdminAlertNotificationById(alertId: number, opts?: { force?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(adminAlertNotifications).where(eq(adminAlertNotifications.id, alertId)).limit(1);
  if (!row) throw new Error("审计告警不存在");
  if (!opts?.force && row.status === "sent") return row;

  let payload: unknown = null;
  try {
    payload = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    payload = row.payload;
  }

  let result: { ok: boolean; skipped: boolean; message: string };
  if (row.channel === "inbox") {
    if (!row.targetUserId) {
      result = { ok: true, skipped: true, message: "未找到站内消息接收人，已跳过" };
    } else {
      const inboxKey = `${row.eventKey}:inbox`;
      const [existingInbox] = await db.select({ id: userNotifications.id }).from(userNotifications).where(eq(userNotifications.eventKey, inboxKey)).limit(1);
      if (!existingInbox) {
        await db.insert(userNotifications).values({
          eventKey: inboxKey,
          userId: row.targetUserId,
          eventType: "admin_audit_alert",
          relatedOrderId: row.relatedOrderId ?? null,
          title: row.title,
          content: row.content,
          actionUrl: row.actionUrl ?? "/admin/audit-alerts",
        });
      }
      result = { ok: true, skipped: false, message: "站内消息已写入" };
    }
  } else if (row.channel === "email") {
    const emailKey = `${row.eventKey}:email`;
    const [existingEmail] = await db.select({ id: emailDeliveries.id }).from(emailDeliveries).where(eq(emailDeliveries.eventKey, emailKey)).limit(1);
    let emailId = existingEmail?.id ?? null;
    if (!existingEmail) {
      await db.insert(emailDeliveries).values({
        eventKey: emailKey,
        eventType: "admin_audit_alert",
        userId: row.targetUserId ?? null,
        relatedOrderId: row.relatedOrderId ?? null,
        provider: resolveEmailProvider(),
        recipientEmail: row.recipient ?? null,
        subject: row.title,
        contentText: row.content,
        contentHtml: `<pre style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space:pre-wrap;">${escapeHtml(row.content)}</pre>`,
        payload: safeJsonStringify(payload),
        status: "pending",
      });
      const [createdEmail] = await db.select({ id: emailDeliveries.id }).from(emailDeliveries).where(eq(emailDeliveries.eventKey, emailKey)).limit(1);
      emailId = createdEmail?.id ?? null;
    }
    if (!emailId) {
      result = { ok: false, skipped: false, message: "邮件投递记录创建失败" };
    } else {
      const delivered = await dispatchEmailDeliveryById(emailId, { force: true });
      result = {
        ok: delivered.status === "sent" || delivered.status === "skipped",
        skipped: delivered.status === "skipped",
        message: delivered.lastError || delivered.status || "邮件已处理",
      };
    }
  } else {
    result = await dispatchAdminAlertDelivery({
      channel: row.channel as AdminAlertChannel,
      eventKey: row.eventKey,
      severity: row.severity as AdminAlertSeverity,
      title: row.title,
      content: row.content,
      recipient: row.recipient ?? null,
      payload,
    });
  }

  const status: AdminAlertStatus = result.skipped ? "skipped" : result.ok ? "sent" : "failed";
  await db
    .update(adminAlertNotifications)
    .set({
      status,
      attempts: sql`${adminAlertNotifications.attempts} + 1` as any,
      lastAttemptAt: new Date(),
      sentAt: status === "sent" ? new Date() : row.sentAt,
      lastError: result.ok ? (result.skipped ? result.message : null) : result.message,
    })
    .where(eq(adminAlertNotifications.id, alertId));

  const [updated] = await db.select().from(adminAlertNotifications).where(eq(adminAlertNotifications.id, alertId)).limit(1);
  return updated ?? row;
}

async function emitAdminAlertsForAudit(auditLogId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await listAdminActionAuditLogs({ limit: 1 });
  let auditRow = rows.find((item) => item.id === auditLogId) ?? null;
  if (!auditRow) {
    const [row] = await db.select().from(adminActionAuditLogs).where(eq(adminActionAuditLogs.id, auditLogId)).limit(1);
    if (row) {
      const enriched = await listAdminActionAuditLogs({ limit: 5 });
      auditRow = enriched.find((item) => item.id === auditLogId) ?? ({ ...row, metadata: parseJsonText(row.metadata), actorUser: null, targetUser: null } as any);
    }
  }
  if (!auditRow) return [];

  await ensureAdminRiskIncidentForAudit(auditRow as any);
  const severity = resolveAdminAlertSeverity(auditRow as any);
  if (!severity) return [];

  const title = buildAdminAlertTitle(auditRow, severity);
  const content = buildAdminAlertContent(auditRow, severity);
  const actionUrl = buildAdminAlertActionUrl(auditRow);
  const payload = {
    auditLogId: auditRow.id,
    actionType: auditRow.actionType,
    actionStatus: auditRow.actionStatus,
    resourceType: auditRow.resourceType,
    resourceId: auditRow.resourceId,
    relatedOrderId: auditRow.relatedOrderId,
    metadata: auditRow.metadata ?? null,
  };

  const createdIds: number[] = [];
  const recipients = await listAdminAlertRecipients();
  const channelTargets: Array<{ channel: AdminAlertChannel; targetUserId?: number | null; recipient?: string | null }> = [
    { channel: "log", recipient: null },
  ];
  if (ENV.adminAlertInboxEnabled) {
    for (const recipient of recipients) channelTargets.push({ channel: "inbox", targetUserId: recipient.id, recipient: recipient.email ?? null });
  }
  if (ENV.adminAlertEmailEnabled) {
    for (const recipient of recipients) channelTargets.push({ channel: "email", targetUserId: recipient.id, recipient: recipient.email ?? null });
  }
  if ((ENV.adminAlertWebhookUrl || '').trim()) {
    channelTargets.push({ channel: "webhook", recipient: ENV.adminAlertWebhookUrl });
  }

  for (const target of channelTargets) {
    const dedupeKey = `admin-audit:${auditRow.id}:${target.channel}:${target.targetUserId ?? 'global'}`;
    const [existing] = await db.select({ id: adminAlertNotifications.id }).from(adminAlertNotifications).where(eq(adminAlertNotifications.eventKey, dedupeKey)).limit(1);
    if (existing) {
      createdIds.push(existing.id);
      continue;
    }
    await db.insert(adminAlertNotifications).values({
      eventKey: dedupeKey,
      auditLogId: auditRow.id,
      actionType: auditRow.actionType,
      severity,
      channel: target.channel,
      targetUserId: target.targetUserId ?? null,
      relatedOrderId: auditRow.relatedOrderId ?? null,
      title,
      content,
      actionUrl,
      recipient: target.recipient ?? null,
      payload: safeJsonStringify(payload),
      status: "pending",
    });
    const [created] = await db.select({ id: adminAlertNotifications.id }).from(adminAlertNotifications).where(eq(adminAlertNotifications.eventKey, dedupeKey)).limit(1);
    if (created) createdIds.push(created.id);
  }

  const dispatched = [];
  for (const id of createdIds) dispatched.push(await dispatchAdminAlertNotificationById(id));
  return dispatched;
}

export async function listAdminAlertNotifications(opts: {
  status?: AdminAlertStatus | "all";
  channel?: AdminAlertChannel | "all";
  severity?: AdminAlertSeverity | "all";
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [] as any[];
  if (opts.status && opts.status !== "all") conditions.push(eq(adminAlertNotifications.status, opts.status));
  if (opts.channel && opts.channel !== "all") conditions.push(eq(adminAlertNotifications.channel, opts.channel));
  if (opts.severity && opts.severity !== "all") conditions.push(eq(adminAlertNotifications.severity, opts.severity));
  const rows = await db
    .select({
      id: adminAlertNotifications.id,
      eventKey: adminAlertNotifications.eventKey,
      auditLogId: adminAlertNotifications.auditLogId,
      actionType: adminAlertNotifications.actionType,
      severity: adminAlertNotifications.severity,
      channel: adminAlertNotifications.channel,
      targetUserId: adminAlertNotifications.targetUserId,
      relatedOrderId: adminAlertNotifications.relatedOrderId,
      title: adminAlertNotifications.title,
      content: adminAlertNotifications.content,
      actionUrl: adminAlertNotifications.actionUrl,
      recipient: adminAlertNotifications.recipient,
      payload: adminAlertNotifications.payload,
      status: adminAlertNotifications.status,
      attempts: adminAlertNotifications.attempts,
      lastAttemptAt: adminAlertNotifications.lastAttemptAt,
      sentAt: adminAlertNotifications.sentAt,
      lastError: adminAlertNotifications.lastError,
      createdAt: adminAlertNotifications.createdAt,
      updatedAt: adminAlertNotifications.updatedAt,
      audit: {
        id: adminActionAuditLogs.id,
        actionLabel: adminActionAuditLogs.actionLabel,
        actionStatus: adminActionAuditLogs.actionStatus,
        resourceType: adminActionAuditLogs.resourceType,
        resourceId: adminActionAuditLogs.resourceId,
        resourceLabel: adminActionAuditLogs.resourceLabel,
      },
      targetUser: {
        id: users.id,
        name: users.name,
        email: users.email,
        openId: users.openId,
      },
    })
    .from(adminAlertNotifications)
    .leftJoin(adminActionAuditLogs, eq(adminAlertNotifications.auditLogId, adminActionAuditLogs.id))
    .leftJoin(users, eq(adminAlertNotifications.targetUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminAlertNotifications.id))
    .limit(Math.max(1, Math.min(Number(opts.limit ?? 200), 300)));
  return rows.map((row) => ({ ...row, payload: parseJsonText(row.payload) }));
}

export async function getAdminAlertOverview() {
  const db = await getDb();
  if (!db) return { total: 0, last24h: 0, failures: 0, pending: 0, critical: 0 };
  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(adminAlertNotifications);
  const [last24hRow] = await db.select({ count: sql<number>`count(*)` }).from(adminAlertNotifications).where(sql`${adminAlertNotifications.createdAt} >= date_sub(now(), interval 1 day)`);
  const [failuresRow] = await db.select({ count: sql<number>`count(*)` }).from(adminAlertNotifications).where(eq(adminAlertNotifications.status, "failed"));
  const [pendingRow] = await db.select({ count: sql<number>`count(*)` }).from(adminAlertNotifications).where(eq(adminAlertNotifications.status, "pending"));
  const [criticalRow] = await db.select({ count: sql<number>`count(*)` }).from(adminAlertNotifications).where(eq(adminAlertNotifications.severity, "critical"));
  return {
    total: Number(totalRow?.count ?? 0),
    last24h: Number(last24hRow?.count ?? 0),
    failures: Number(failuresRow?.count ?? 0),
    pending: Number(pendingRow?.count ?? 0),
    critical: Number(criticalRow?.count ?? 0),
  };
}

export async function getAdminRiskOverview() {
  await syncRecentAdminRiskIncidents();
  await autoEscalateAdminRiskIncidents();
  await ensureDefaultAdminRiskSlaSetup();
  const db = await getDb();
  if (!db) return { total: 0, open: 0, acknowledged: 0, resolved: 0, criticalOpen: 0, escalated: 0, breached: 0, unassigned: 0, last24h: 0 };
  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents);
  const [openRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents).where(eq(adminRiskIncidents.status, "open"));
  const [ackRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents).where(eq(adminRiskIncidents.status, "acknowledged"));
  const [resolvedRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents).where(eq(adminRiskIncidents.status, "resolved"));
  const [criticalOpenRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents).where(and(eq(adminRiskIncidents.status, "open"), eq(adminRiskIncidents.severity, "critical")));
  const [escalatedRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents).where(sql`${adminRiskIncidents.escalationLevel} > 0 and ${adminRiskIncidents.status} <> 'resolved'`);
  const [last24hRow] = await db.select({ count: sql<number>`count(*)` }).from(adminRiskIncidents).where(sql`${adminRiskIncidents.createdAt} >= date_sub(now(), interval 1 day)`);
  return {
    total: Number(totalRow?.count ?? 0),
    open: Number(openRow?.count ?? 0),
    acknowledged: Number(ackRow?.count ?? 0),
    resolved: Number(resolvedRow?.count ?? 0),
    criticalOpen: Number(criticalOpenRow?.count ?? 0),
    escalated: Number(escalatedRow?.count ?? 0),
    last24h: Number(last24hRow?.count ?? 0),
  };
}

export async function listAdminRiskIncidents(opts: {
  status?: AdminRiskStatus | "all";
  severity?: AdminAlertSeverity | "all";
  escalation?: "all" | "none" | "escalated";
  limit?: number;
} = {}) {
  await syncRecentAdminRiskIncidents();
  await autoEscalateAdminRiskIncidents();
  const db = await getDb();
  if (!db) return [];
  const conditions = [] as any[];
  if (opts.status && opts.status !== "all") conditions.push(eq(adminRiskIncidents.status, opts.status));
  if (opts.severity && opts.severity !== "all") conditions.push(eq(adminRiskIncidents.severity, opts.severity));
  if (opts.escalation === "none") conditions.push(eq(adminRiskIncidents.escalationLevel, 0));
  if (opts.escalation === "escalated") conditions.push(sql`${adminRiskIncidents.escalationLevel} > 0`);
  const rows = await db
    .select({
      id: adminRiskIncidents.id,
      auditLogId: adminRiskIncidents.auditLogId,
      severity: adminRiskIncidents.severity,
      riskScore: adminRiskIncidents.riskScore,
      status: adminRiskIncidents.status,
      escalationLevel: adminRiskIncidents.escalationLevel,
      slaStatus: adminRiskIncidents.slaStatus,
      title: adminRiskIncidents.title,
      summary: adminRiskIncidents.summary,
      payload: adminRiskIncidents.payload,
      firstSeenAt: adminRiskIncidents.firstSeenAt,
      lastSeenAt: adminRiskIncidents.lastSeenAt,
      lastEscalatedAt: adminRiskIncidents.lastEscalatedAt,
      ownerUserId: adminRiskIncidents.ownerUserId,
      ownerAssignedAt: adminRiskIncidents.ownerAssignedAt,
      ackDueAt: adminRiskIncidents.ackDueAt,
      resolveDueAt: adminRiskIncidents.resolveDueAt,
      acknowledgedAt: adminRiskIncidents.acknowledgedAt,
      acknowledgedByUserId: adminRiskIncidents.acknowledgedByUserId,
      resolvedAt: adminRiskIncidents.resolvedAt,
      resolvedByUserId: adminRiskIncidents.resolvedByUserId,
      handlingNote: adminRiskIncidents.handlingNote,
      createdAt: adminRiskIncidents.createdAt,
      updatedAt: adminRiskIncidents.updatedAt,
      playbook: { id: adminRiskPlaybooks.id, code: adminRiskPlaybooks.code, name: adminRiskPlaybooks.name, summary: adminRiskPlaybooks.summary, checklist: adminRiskPlaybooks.checklist },
      audit: {
        id: adminActionAuditLogs.id,
        actionType: adminActionAuditLogs.actionType,
        actionLabel: adminActionAuditLogs.actionLabel,
        actionStatus: adminActionAuditLogs.actionStatus,
        resourceType: adminActionAuditLogs.resourceType,
        resourceId: adminActionAuditLogs.resourceId,
        resourceLabel: adminActionAuditLogs.resourceLabel,
        relatedOrderId: adminActionAuditLogs.relatedOrderId,
        targetUserId: adminActionAuditLogs.targetUserId,
        createdAt: adminActionAuditLogs.createdAt,
      },
      actorUser: {
        id: users.id,
        name: users.name,
        email: users.email,
        openId: users.openId,
      },
      ownerUser: {
        id: ownerUserAlias.id,
        name: ownerUserAlias.name,
        email: ownerUserAlias.email,
        openId: ownerUserAlias.openId,
      },
    })
    .from(adminRiskIncidents)
    .leftJoin(adminRiskPlaybooks, eq(adminRiskIncidents.playbookId, adminRiskPlaybooks.id))
    .leftJoin(adminActionAuditLogs, eq(adminRiskIncidents.auditLogId, adminActionAuditLogs.id))
    .leftJoin(users, eq(adminActionAuditLogs.actorUserId, users.id))
    .leftJoin(ownerUserAlias, eq(adminRiskIncidents.ownerUserId, ownerUserAlias.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminRiskIncidents.escalationLevel), desc(adminRiskIncidents.riskScore), desc(adminRiskIncidents.id))
    .limit(Math.max(1, Math.min(Number(opts.limit ?? 200), 300)));
  return rows.map((row) => ({ ...row, payload: parseJsonText(row.payload) }));
}

export async function getAdminRiskLiveSnapshot() {
  const [overview, rows] = await Promise.all([
    getAdminRiskOverview(),
    listAdminRiskIncidents({ status: "all", limit: 12 }),
  ]);
  return {
    overview,
    newestIncidentId: rows[0]?.id ?? null,
    openIncidentId: rows.find((row) => row.status === "open")?.id ?? null,
    criticalOpenIds: rows.filter((row) => row.status === "open" && row.severity === "critical").map((row) => row.id),
    ts: Date.now(),
  };
}

export async function acknowledgeAdminRiskIncident(incidentId: number, userId: number, note?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(adminRiskIncidents).set({
    status: "acknowledged",
    acknowledgedAt: new Date(),
    acknowledgedByUserId: userId,
    ownerUserId: sql`coalesce(${adminRiskIncidents.ownerUserId}, ${userId})` as any,
    ownerAssignedAt: sql`coalesce(${adminRiskIncidents.ownerAssignedAt}, now())` as any,
    handlingNote: note ?? null,
  }).where(eq(adminRiskIncidents.id, incidentId));
  await applySlaAndOwnerToIncident(incidentId);
  const [row] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  return row;
}

export async function resolveAdminRiskIncident(incidentId: number, userId: number, note?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(adminRiskIncidents).set({
    status: "resolved",
    resolvedAt: new Date(),
    resolvedByUserId: userId,
    slaStatus: "resolved",
    handlingNote: note ?? null,
  }).where(eq(adminRiskIncidents.id, incidentId));
  const [row] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  return row;
}

export async function escalateAdminRiskIncident(incidentId: number, userId: number, note?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  if (!row) throw new Error("风险事件不存在");
  const nextLevel = Math.min(3, Number(row.escalationLevel || 0) + 1);
  await db.update(adminRiskIncidents).set({
    escalationLevel: nextLevel,
    lastEscalatedAt: new Date(),
    status: row.status === "resolved" ? "resolved" : "open",
    handlingNote: note ?? row.handlingNote ?? null,
  }).where(eq(adminRiskIncidents.id, incidentId));
  await dispatchAdminRiskEscalationNotifications(incidentId, note?.trim() ? note.trim() : `管理员 #${userId} 手动升级风险事件`);
  const [updated] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  return updated;
}

export async function retryAdminAlertNotification(alertId: number) {
  return dispatchAdminAlertNotificationById(alertId, { force: true });
}

// P20 placeholders

function getDefaultRiskPlaybookTemplates() {
  return [
    {
      code: "critical-delete",
      name: "??????",
      triggerSeverity: "critical" as AdminRiskTriggerSeverity,
      actionType: null,
      resourceType: null,
      summary: "???????????????????????????",
      checklist: [
        "1. ????????",
        "2. ??????",
        "3. ????????/??",
        "4. ????????????",
      ].join("\n"),
      enabled: true,
    },
    {
      code: "payment-refund",
      name: "?????????",
      triggerSeverity: "critical" as AdminRiskTriggerSeverity,
      actionType: "commerce.order.refund",
      resourceType: "order",
      summary: "????????????????????????????",
      checklist: [
        "1. ?????????",
        "2. ??????",
        "3. ?????????",
        "4. ????????",
      ].join("\n"),
      enabled: true,
    },
  ];
}

function getDefaultRiskRuleTemplates() {
  return [
    {
      name: "高危删除自动挂处置 SOP",
      triggerSeverity: "critical" as AdminRiskTriggerSeverity,
      actionType: null,
      resourceType: null,
      minRiskScore: 80,
      playbookCode: "critical-delete",
      autoAcknowledge: false,
      autoEscalate: true,
      executionNote: "高危删除事件自动升级并挂到高危删除 SOP。",
      enabled: true,
    },
    {
      name: "退款事件自动挂退款 SOP",
      triggerSeverity: "critical" as AdminRiskTriggerSeverity,
      actionType: "commerce.order.refund",
      resourceType: "order",
      minRiskScore: 80,
      playbookCode: "payment-refund",
      autoAcknowledge: true,
      autoEscalate: false,
      executionNote: "退款事件自动进入已确认状态，等待财务或客服跟进。",
      enabled: true,
    },
  ];
}

function matchesRiskAutomationRule(
  incident: { severity: string; riskScore: number; actionType?: string | null; resourceType?: string | null },
  rule: { triggerSeverity: AdminRiskTriggerSeverity; minRiskScore: number; actionType?: string | null; resourceType?: string | null }
) {
  if (rule.triggerSeverity !== "all" && rule.triggerSeverity !== incident.severity) return false;
  if (Number(incident.riskScore || 0) < Number(rule.minRiskScore || 0)) return false;
  if ((rule.actionType || "").trim() && rule.actionType !== incident.actionType) return false;
  if ((rule.resourceType || "").trim() && rule.resourceType !== incident.resourceType) return false;
  return true;
}

export async function ensureDefaultAdminRiskAutomationSetup() {
  const db = await getDb();
  if (!db) return;
  const existingPlaybooks = await db.select({ id: adminRiskPlaybooks.id, code: adminRiskPlaybooks.code }).from(adminRiskPlaybooks).limit(50);
  const playbookCodeToId = new Map(existingPlaybooks.map((row) => [row.code, row.id]));
  for (const tpl of getDefaultRiskPlaybookTemplates()) {
    if (playbookCodeToId.has(tpl.code)) continue;
    await db.insert(adminRiskPlaybooks).values(tpl as any);
  }
  const refreshedPlaybooks = await db.select({ id: adminRiskPlaybooks.id, code: adminRiskPlaybooks.code }).from(adminRiskPlaybooks).limit(50);
  const refreshedMap = new Map(refreshedPlaybooks.map((row) => [row.code, row.id]));

  const existingRules = await db.select({ id: adminRiskAutomationRules.id, name: adminRiskAutomationRules.name }).from(adminRiskAutomationRules).limit(50);
  const existingNames = new Set(existingRules.map((row) => row.name));
  for (const tpl of getDefaultRiskRuleTemplates()) {
    if (existingNames.has(tpl.name)) continue;
    await db.insert(adminRiskAutomationRules).values({
      name: tpl.name,
      triggerSeverity: tpl.triggerSeverity,
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      minRiskScore: tpl.minRiskScore,
      playbookId: refreshedMap.get(tpl.playbookCode) ?? null,
      autoAcknowledge: tpl.autoAcknowledge,
      autoEscalate: tpl.autoEscalate,
      executionNote: tpl.executionNote,
      enabled: tpl.enabled,
    } as any);
  }
}

export async function listAdminRiskPlaybooks() {
  await ensureDefaultAdminRiskAutomationSetup();
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminRiskPlaybooks).orderBy(desc(adminRiskPlaybooks.enabled), asc(adminRiskPlaybooks.name));
}

export async function upsertAdminRiskPlaybook(input: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const payload = {
    code: input.code,
    name: input.name,
    triggerSeverity: input.triggerSeverity,
    actionType: input.actionType ?? null,
    resourceType: input.resourceType ?? null,
    summary: input.summary ?? null,
    checklist: input.checklist ?? null,
    enabled: input.enabled,
  };
  if (input.id) {
    await db.update(adminRiskPlaybooks).set(payload as any).where(eq(adminRiskPlaybooks.id, input.id));
    const [row] = await db.select().from(adminRiskPlaybooks).where(eq(adminRiskPlaybooks.id, input.id)).limit(1);
    return row;
  }
  await db.insert(adminRiskPlaybooks).values(payload as any);
  const [row] = await db.select().from(adminRiskPlaybooks).where(eq(adminRiskPlaybooks.code, input.code)).limit(1);
  return row;
}

export async function deleteAdminRiskPlaybook(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(adminRiskPlaybooks).where(eq(adminRiskPlaybooks.id, id));
  return { success: true };
}

export async function listAdminRiskAutomationRules() {
  await ensureDefaultAdminRiskAutomationSetup();
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: adminRiskAutomationRules.id,
      name: adminRiskAutomationRules.name,
      triggerSeverity: adminRiskAutomationRules.triggerSeverity,
      actionType: adminRiskAutomationRules.actionType,
      resourceType: adminRiskAutomationRules.resourceType,
      minRiskScore: adminRiskAutomationRules.minRiskScore,
      playbookId: adminRiskAutomationRules.playbookId,
      autoAcknowledge: adminRiskAutomationRules.autoAcknowledge,
      autoEscalate: adminRiskAutomationRules.autoEscalate,
      executionNote: adminRiskAutomationRules.executionNote,
      enabled: adminRiskAutomationRules.enabled,
      createdAt: adminRiskAutomationRules.createdAt,
      updatedAt: adminRiskAutomationRules.updatedAt,
      playbook: { id: adminRiskPlaybooks.id, code: adminRiskPlaybooks.code, name: adminRiskPlaybooks.name },
    })
    .from(adminRiskAutomationRules)
    .leftJoin(adminRiskPlaybooks, eq(adminRiskAutomationRules.playbookId, adminRiskPlaybooks.id))
    .orderBy(desc(adminRiskAutomationRules.enabled), asc(adminRiskAutomationRules.name));
}

export async function upsertAdminRiskAutomationRule(input: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const payload = {
    name: input.name,
    triggerSeverity: input.triggerSeverity,
    actionType: input.actionType ?? null,
    resourceType: input.resourceType ?? null,
    minRiskScore: input.minRiskScore,
    playbookId: input.playbookId ?? null,
    autoAcknowledge: input.autoAcknowledge,
    autoEscalate: input.autoEscalate,
    executionNote: input.executionNote ?? null,
    enabled: input.enabled,
  };
  if (input.id) {
    await db.update(adminRiskAutomationRules).set(payload as any).where(eq(adminRiskAutomationRules.id, input.id));
    const [row] = await db.select().from(adminRiskAutomationRules).where(eq(adminRiskAutomationRules.id, input.id)).limit(1);
    return row;
  }
  await db.insert(adminRiskAutomationRules).values(payload as any);
  const [row] = await db.select().from(adminRiskAutomationRules).orderBy(desc(adminRiskAutomationRules.id)).limit(1);
  return row;
}

export async function deleteAdminRiskAutomationRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(adminRiskAutomationRules).where(eq(adminRiskAutomationRules.id, id));
  return { success: true };
}

export async function listAdminRiskRuleExecutions(incidentId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [] as any[];
  if (incidentId) conditions.push(eq(adminRiskRuleExecutions.incidentId, incidentId));
  const rows = await db
    .select({
      id: adminRiskRuleExecutions.id,
      incidentId: adminRiskRuleExecutions.incidentId,
      ruleId: adminRiskRuleExecutions.ruleId,
      playbookId: adminRiskRuleExecutions.playbookId,
      status: adminRiskRuleExecutions.status,
      executionSummary: adminRiskRuleExecutions.executionSummary,
      payload: adminRiskRuleExecutions.payload,
      executedAt: adminRiskRuleExecutions.executedAt,
      createdAt: adminRiskRuleExecutions.createdAt,
      rule: { id: adminRiskAutomationRules.id, name: adminRiskAutomationRules.name },
      playbook: { id: adminRiskPlaybooks.id, code: adminRiskPlaybooks.code, name: adminRiskPlaybooks.name },
    })
    .from(adminRiskRuleExecutions)
    .leftJoin(adminRiskAutomationRules, eq(adminRiskRuleExecutions.ruleId, adminRiskAutomationRules.id))
    .leftJoin(adminRiskPlaybooks, eq(adminRiskRuleExecutions.playbookId, adminRiskPlaybooks.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminRiskRuleExecutions.id))
    .limit(200);
  return rows.map((row) => ({ ...row, payload: parseJsonText(row.payload) }));
}

export async function listAdminRiskSlaPolicies() {
  await ensureDefaultAdminRiskSlaSetup();
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminRiskSlaPolicies).orderBy(desc(adminRiskSlaPolicies.enabled), asc(adminRiskSlaPolicies.acknowledgeMinutes), asc(adminRiskSlaPolicies.id));
}

export async function upsertAdminRiskSlaPolicy(input: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const payload = { name: input.name, triggerSeverity: input.triggerSeverity, actionType: input.actionType ?? null, resourceType: input.resourceType ?? null, acknowledgeMinutes: input.acknowledgeMinutes, resolveMinutes: input.resolveMinutes, enabled: input.enabled };
  if (input.id) {
    await db.update(adminRiskSlaPolicies).set(payload as any).where(eq(adminRiskSlaPolicies.id, input.id));
    const [row] = await db.select().from(adminRiskSlaPolicies).where(eq(adminRiskSlaPolicies.id, input.id)).limit(1);
    return row;
  }
  await db.insert(adminRiskSlaPolicies).values(payload as any);
  const [row] = await db.select().from(adminRiskSlaPolicies).orderBy(desc(adminRiskSlaPolicies.id)).limit(1);
  return row;
}

export async function deleteAdminRiskSlaPolicy(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(adminRiskSlaPolicies).where(eq(adminRiskSlaPolicies.id, id));
  return { success: true };
}

export async function listAdminRiskOncallAssignments() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: adminRiskOncallAssignments.id, name: adminRiskOncallAssignments.name, userId: adminRiskOncallAssignments.userId, triggerSeverity: adminRiskOncallAssignments.triggerSeverity, actionType: adminRiskOncallAssignments.actionType, resourceType: adminRiskOncallAssignments.resourceType, isPrimary: adminRiskOncallAssignments.isPrimary, enabled: adminRiskOncallAssignments.enabled, createdAt: adminRiskOncallAssignments.createdAt, updatedAt: adminRiskOncallAssignments.updatedAt, user: { id: users.id, name: users.name, email: users.email, openId: users.openId, adminLevel: users.adminLevel } }).from(adminRiskOncallAssignments).leftJoin(users, eq(adminRiskOncallAssignments.userId, users.id)).orderBy(desc(adminRiskOncallAssignments.enabled), desc(adminRiskOncallAssignments.isPrimary), asc(adminRiskOncallAssignments.id));
}

export async function upsertAdminRiskOncallAssignment(input: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const payload = { name: input.name, userId: input.userId, triggerSeverity: input.triggerSeverity, actionType: input.actionType ?? null, resourceType: input.resourceType ?? null, isPrimary: input.isPrimary, enabled: input.enabled };
  if (input.id) {
    await db.update(adminRiskOncallAssignments).set(payload as any).where(eq(adminRiskOncallAssignments.id, input.id));
  } else {
    await db.insert(adminRiskOncallAssignments).values(payload as any);
  }
  const [row] = await db.select().from(adminRiskOncallAssignments).orderBy(desc(adminRiskOncallAssignments.id)).limit(1);
  return row;
}

export async function deleteAdminRiskOncallAssignment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(adminRiskOncallAssignments).where(eq(adminRiskOncallAssignments.id, id));
  return { success: true };
}

export async function listAdminRiskAssignableUsers() {
  return listAssignableRiskAdmins();
}

export async function assignAdminRiskIncidentOwner(incidentId: number, ownerUserId: number, note?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select({ handlingNote: adminRiskIncidents.handlingNote }).from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  await db.update(adminRiskIncidents).set({ ownerUserId, ownerAssignedAt: new Date(), handlingNote: note ? `${current?.handlingNote ? `${current.handlingNote}
` : ""}${note}` : current?.handlingNote ?? null }).where(eq(adminRiskIncidents.id, incidentId));
  await applySlaAndOwnerToIncident(incidentId);
  const [row] = await db.select().from(adminRiskIncidents).where(eq(adminRiskIncidents.id, incidentId)).limit(1);
  return row;
}

export async function claimAdminRiskIncident(incidentId: number, userId: number, note?: string | null) {
  return assignAdminRiskIncidentOwner(incidentId, userId, note ?? "值班人员认领风险事件");
}

export async function applyAdminRiskAutomation(incidentId: number) {
  await ensureDefaultAdminRiskAutomationSetup();
  const db = await getDb();
  if (!db) return [];
  const [incident] = await db
    .select({
      id: adminRiskIncidents.id,
      severity: adminRiskIncidents.severity,
      riskScore: adminRiskIncidents.riskScore,
      status: adminRiskIncidents.status,
      escalationLevel: adminRiskIncidents.escalationLevel,
      playbookId: adminRiskIncidents.playbookId,
      handlingNote: adminRiskIncidents.handlingNote,
      actionType: adminActionAuditLogs.actionType,
      resourceType: adminActionAuditLogs.resourceType,
    })
    .from(adminRiskIncidents)
    .leftJoin(adminRiskPlaybooks, eq(adminRiskIncidents.playbookId, adminRiskPlaybooks.id))
    .leftJoin(adminActionAuditLogs, eq(adminRiskIncidents.auditLogId, adminActionAuditLogs.id))
    .where(eq(adminRiskIncidents.id, incidentId))
    .limit(1);
  if (!incident) return [];
  const rules = await db.select().from(adminRiskAutomationRules).where(eq(adminRiskAutomationRules.enabled, true)).orderBy(desc(adminRiskAutomationRules.minRiskScore), asc(adminRiskAutomationRules.id));
  const outcomes: any[] = [];
  for (const rule of rules) {
    if (!matchesRiskAutomationRule(incident as any, rule as any)) continue;
    const [existing] = await db.select({ id: adminRiskRuleExecutions.id }).from(adminRiskRuleExecutions).where(and(eq(adminRiskRuleExecutions.incidentId, incidentId), eq(adminRiskRuleExecutions.ruleId, rule.id))).limit(1);
    if (existing) {
      outcomes.push({ ruleId: rule.id, status: "duplicate" });
      continue;
    }
    let status: "matched" | "executed" | "skipped" | "failed" = "matched";
    const notes: string[] = [];
    try {
      if (rule.playbookId && incident.playbookId !== rule.playbookId) {
        await db.update(adminRiskIncidents).set({ playbookId: rule.playbookId }).where(eq(adminRiskIncidents.id, incidentId));
        notes.push(`已关联 SOP #${rule.playbookId}`);
      }
      if (rule.autoAcknowledge && incident.status === "open") {
        await db.update(adminRiskIncidents).set({ status: "acknowledged", acknowledgedAt: new Date(), handlingNote: (incident.handlingNote ? `${incident.handlingNote}
` : "") + (rule.executionNote || "自动确认风险事件") }).where(eq(adminRiskIncidents.id, incidentId));
        incident.status = "acknowledged" as any;
        notes.push("已自动确认");
      }
      if (rule.autoEscalate && Number(incident.escalationLevel || 0) < 3) {
        const nextLevel = Number(incident.escalationLevel || 0) + 1;
        await db.update(adminRiskIncidents).set({ escalationLevel: nextLevel, lastEscalatedAt: new Date() }).where(eq(adminRiskIncidents.id, incidentId));
        incident.escalationLevel = nextLevel as any;
        await dispatchAdminRiskEscalationNotifications(incidentId, rule.executionNote || `自动化规则 #${rule.id} 升级`);
        notes.push(`已自动升级到 L${nextLevel}`);
      }
      if (!notes.length) notes.push("规则命中，已挂接 SOP");
      status = notes.some((item) => item.includes("自动")) ? "executed" : "matched";
    } catch (error: any) {
      status = "failed";
      notes.push(error?.message || "执行失败");
    }
    await db.insert(adminRiskRuleExecutions).values({
      incidentId,
      ruleId: rule.id,
      playbookId: rule.playbookId ?? null,
      status,
      executionSummary: notes.join("；"),
      payload: safeJsonStringify({ incident, rule }),
      executedAt: new Date(),
    } as any);
    outcomes.push({ ruleId: rule.id, status, summary: notes.join("；") });
  }
  return outcomes;
}


function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function getStats() {
  const db = await getDb();
  if (!db) {
    return {
      courseCount: 0,
      categoryCount: 0,
      commentCount: 0,
      userCount: 0,
      mediaCount: 0,
      productCount: 0,
      orderCount: 0,
    };
  }

  const [courseCount, categoryCount, commentCount, userCount, mediaCount, productCount, orderCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(courses),
    db.select({ count: sql<number>`count(*)` }).from(categories),
    db.select({ count: sql<number>`count(*)` }).from(comments),
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(mediaAssets),
    db.select({ count: sql<number>`count(*)` }).from(products),
    db.select({ count: sql<number>`count(*)` }).from(orders),
  ]);

  return {
    courseCount: Number(courseCount[0]?.count ?? 0),
    categoryCount: Number(categoryCount[0]?.count ?? 0),
    commentCount: Number(commentCount[0]?.count ?? 0),
    userCount: Number(userCount[0]?.count ?? 0),
    mediaCount: Number(mediaCount[0]?.count ?? 0),
    productCount: Number(productCount[0]?.count ?? 0),
    orderCount: Number(orderCount[0]?.count ?? 0),
  };
}
