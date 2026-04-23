import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatarUrl"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  phoneVerifiedAt: timestamp("phoneVerifiedAt"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  adminLevel: varchar("adminLevel", { length: 32 }),
  status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
  sessionVersion: int("sessionVersion").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userIdentities = mysqlTable(
  "user_identities",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerUserId: varchar("providerUserId", { length: 191 }).notNull(),
    providerUnionId: varchar("providerUnionId", { length: 191 }),
    displayName: varchar("displayName", { length: 255 }),
    avatarUrl: text("avatarUrl"),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    verifiedAt: timestamp("verifiedAt"),
    lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    providerUserUnique: uniqueIndex("user_identities_provider_user_unique").on(
      table.provider,
      table.providerUserId
    ),
    userProviderIndex: index("user_identities_user_provider_idx").on(
      table.userId,
      table.provider
    ),
    unionIndex: index("user_identities_provider_union_idx").on(
      table.providerUnionId
    ),
  })
);

export type UserIdentity = typeof userIdentities.$inferSelect;
export type InsertUserIdentity = typeof userIdentities.$inferInsert;

export const authOtps = mysqlTable(
  "auth_otps",
  {
    id: int("id").autoincrement().primaryKey(),
    channel: mysqlEnum("channel", ["sms", "email"]).notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    target: varchar("target", { length: 191 }).notNull(),
    codeHash: varchar("codeHash", { length: 255 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    attemptCount: int("attemptCount").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(5).notNull(),
    requestIp: varchar("requestIp", { length: 128 }),
    userAgent: varchar("userAgent", { length: 512 }),
    providerRequestId: varchar("providerRequestId", { length: 191 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    targetLookupIndex: index("auth_otps_target_lookup_idx").on(
      table.channel,
      table.target,
      table.purpose,
      table.createdAt
    ),
    expiresAtIndex: index("auth_otps_expires_at_idx").on(table.expiresAt),
  })
);

export type AuthOtp = typeof authOtps.$inferSelect;
export type InsertAuthOtp = typeof authOtps.$inferInsert;

export const authAuditLogs = mysqlTable(
  "auth_audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id),
    identityId: int("identityId").references(() => userIdentities.id),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 32 }),
    target: varchar("target", { length: 191 }),
    ipAddress: varchar("ipAddress", { length: 128 }),
    userAgent: varchar("userAgent", { length: 512 }),
    success: boolean("success").default(true).notNull(),
    errorCode: varchar("errorCode", { length: 64 }),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedAtIndex: index("auth_audit_logs_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    eventTypeCreatedAtIndex: index("auth_audit_logs_event_created_idx").on(
      table.eventType,
      table.createdAt
    ),
  })
);

export type AuthAuditLog = typeof authAuditLogs.$inferSelect;
export type InsertAuthAuditLog = typeof authAuditLogs.$inferInsert;

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 32 }).default("#6366f1"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  coverUrl: text("coverUrl"),
  videoUrl: text("videoUrl"),
  categoryId: int("categoryId").references(() => categories.id),
  duration: int("duration").default(0),
  level: mysqlEnum("level", ["beginner", "intermediate", "advanced"]).default("beginner"),
  status: mysqlEnum("status", ["draft", "published"]).default("draft"),
  accessType: mysqlEnum("accessType", ["free", "login", "vip", "paid"]).default("free").notNull(),
  trialChapterCount: int("trialChapterCount").default(1),
  priceCents: int("priceCents").default(0),
  featured: boolean("featured").default(false),
  featuredOrder: int("featuredOrder").default(0),
  viewCount: int("viewCount").default(0),
  rating: float("rating").default(0),
  ratingCount: int("ratingCount").default(0),
  instructor: varchar("instructor", { length: 255 }),
  tags: text("tags"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

export const chapters = mysqlTable("chapters", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull().references(() => courses.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  videoUrl: text("videoUrl"),
  duration: int("duration").default(0),
  sortOrder: int("sortOrder").default(0),
  isFree: boolean("isFree").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = typeof chapters.$inferInsert;

export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull().references(() => courses.id),
  userId: int("userId").notNull().references(() => users.id),
  content: text("content").notNull(),
  rating: int("rating").default(5),
  parentId: int("parentId"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

export const mediaAssets = mysqlTable(
  "media_assets",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["image", "video", "file"]).notNull().default("file"),
    originName: varchar("originName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }),
    url: text("url").notNull(),
    mimeType: varchar("mimeType", { length: 255 }),
    size: int("size").default(0),
    duration: int("duration").default(0),
    source: mysqlEnum("source", ["local", "storage", "remote"]).notNull().default("local"),
    accessLevel: mysqlEnum("accessLevel", ["public", "protected"]).notNull().default("public"),
    transcodeStatus: mysqlEnum("transcodeStatus", ["none", "queued", "processing", "ready", "failed"]).notNull().default("none"),
    transcodeJobId: varchar("transcodeJobId", { length: 128 }),
    hlsManifestKey: varchar("hlsManifestKey", { length: 512 }),
    hlsManifestUrl: text("hlsManifestUrl"),
    posterUrl: text("posterUrl"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    storageKeyUnique: uniqueIndex("media_assets_storageKey_unique").on(table.storageKey),
    hlsManifestKeyUnique: uniqueIndex("media_assets_hlsManifestKey_unique").on(table.hlsManifestKey),
  })
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = typeof mediaAssets.$inferInsert;

export const userCourseProgress = mysqlTable(
  "user_course_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    courseId: int("courseId").notNull().references(() => courses.id),
    progressPercent: int("progressPercent").default(0),
    lastChapterId: int("lastChapterId").references(() => chapters.id),
    lastPositionSeconds: int("lastPositionSeconds").default(0),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userCourseUnique: uniqueIndex("user_course_progress_user_course_unique").on(
      table.userId,
      table.courseId
    ),
  })
);

export type UserCourseProgress = typeof userCourseProgress.$inferSelect;
export type InsertUserCourseProgress = typeof userCourseProgress.$inferInsert;

export const userChapterProgress = mysqlTable(
  "user_chapter_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    chapterId: int("chapterId").notNull().references(() => chapters.id),
    watchedSeconds: int("watchedSeconds").default(0),
    completed: boolean("completed").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userChapterUnique: uniqueIndex("user_chapter_progress_user_chapter_unique").on(
      table.userId,
      table.chapterId
    ),
  })
);

export type UserChapterProgress = typeof userChapterProgress.$inferSelect;
export type InsertUserChapterProgress = typeof userChapterProgress.$inferInsert;

export const userLearningHistory = mysqlTable("user_learning_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  courseId: int("courseId").notNull().references(() => courses.id),
  chapterId: int("chapterId").references(() => chapters.id),
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
});

export type UserLearningHistory = typeof userLearningHistory.$inferSelect;
export type InsertUserLearningHistory = typeof userLearningHistory.$inferInsert;

export const userFavorites = mysqlTable(
  "user_favorites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    courseId: int("courseId").notNull().references(() => courses.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userFavoriteUnique: uniqueIndex("user_favorites_user_course_unique").on(table.userId, table.courseId),
  })
);

export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertUserFavorite = typeof userFavorites.$inferInsert;


export const siteSettings = mysqlTable(
  "site_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    settingKey: varchar("settingKey", { length: 120 }).notNull(),
    value: text("value"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    settingKeyUnique: uniqueIndex("site_settings_key_unique").on(table.settingKey),
  })
);

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

export const systemSettings = mysqlTable(
  "system_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    settingKey: varchar("settingKey", { length: 120 }).notNull(),
    value: text("value"),
    updatedBy: int("updatedBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    settingKeyUnique: uniqueIndex("system_settings_key_unique").on(table.settingKey),
  })
);

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;


export const systemConfigSnapshots = mysqlTable(
  "system_config_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    snapshotType: mysqlEnum("snapshotType", ["export", "import", "restore"]).notNull().default("export"),
    strategy: mysqlEnum("strategy", ["merge", "replace"]).notNull().default("merge"),
    name: varchar("name", { length: 191 }).notNull(),
    description: text("description"),
    itemCount: int("itemCount").default(0).notNull(),
    checksum: varchar("checksum", { length: 64 }),
    payload: text("payload").notNull(),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export type SystemConfigSnapshot = typeof systemConfigSnapshots.$inferSelect;
export type InsertSystemConfigSnapshot = typeof systemConfigSnapshots.$inferInsert;

export const systemSettingAuditLogs = mysqlTable(
  "system_setting_audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    settingKey: varchar("settingKey", { length: 120 }),
    action: mysqlEnum("action", ["set", "clear", "import", "restore", "export"]).notNull().default("set"),
    changeSource: mysqlEnum("changeSource", ["admin_ui", "snapshot_import", "snapshot_restore", "snapshot_export"]).notNull().default("admin_ui"),
    snapshotId: int("snapshotId"),
    isSecret: boolean("isSecret").default(false).notNull(),
    previousValuePreview: text("previousValuePreview"),
    nextValuePreview: text("nextValuePreview"),
    previousValueHash: varchar("previousValueHash", { length: 64 }),
    nextValueHash: varchar("nextValueHash", { length: 64 }),
    metadata: text("metadata"),
    updatedBy: int("updatedBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    snapshotFk: foreignKey({
      name: "ss_audit_logs_snapshot_fk",
      columns: [table.snapshotId],
      foreignColumns: [systemConfigSnapshots.id],
    }),
  })
);

export type SystemSettingAuditLog = typeof systemSettingAuditLogs.$inferSelect;
export type InsertSystemSettingAuditLog = typeof systemSettingAuditLogs.$inferInsert;

export const homepageBanners = mysqlTable("homepage_banners", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("imageUrl"),
  ctaText: varchar("ctaText", { length: 120 }),
  ctaLink: varchar("ctaLink", { length: 255 }),
  isActive: boolean("isActive").default(true),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomepageBanner = typeof homepageBanners.$inferSelect;
export type InsertHomepageBanner = typeof homepageBanners.$inferInsert;


export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", ["course", "vip"]).notNull().default("course"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("active"),
    courseId: int("courseId").references(() => courses.id),
    priceCents: int("priceCents").default(0).notNull(),
    durationDays: int("durationDays"),
    coverUrl: text("coverUrl"),
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    courseUnique: uniqueIndex("products_course_unique").on(table.courseId),
  })
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderNo: varchar("orderNo", { length: 64 }).notNull(),
    userId: int("userId").notNull().references(() => users.id),
    productId: int("productId").notNull().references(() => products.id),
    courseId: int("courseId").references(() => courses.id),
    productSnapshotTitle: varchar("productSnapshotTitle", { length: 255 }).notNull(),
    amountCents: int("amountCents").default(0).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 96 }),
    status: mysqlEnum("status", ["pending", "paid", "cancelled", "refunded"]).notNull().default("pending"),
    paymentMethod: mysqlEnum("paymentMethod", ["mock", "manual", "wechat", "alipay"]).notNull().default("mock"),
    providerTradeNo: varchar("providerTradeNo", { length: 128 }),
    paidAmountCents: int("paidAmountCents").default(0).notNull(),
    paymentCallbackAt: timestamp("paymentCallbackAt"),
    paymentPayload: text("paymentPayload"),
    refundedAt: timestamp("refundedAt"),
    refundAmountCents: int("refundAmountCents").default(0).notNull(),
    refundReason: text("refundReason"),
    benefitsGrantedAt: timestamp("benefitsGrantedAt"),
    benefitsRepairCount: int("benefitsRepairCount").default(0).notNull(),
    lastBenefitRepairAt: timestamp("lastBenefitRepairAt"),
    benefitsRevokedAt: timestamp("benefitsRevokedAt"),
    benefitsRevokeCount: int("benefitsRevokeCount").default(0).notNull(),
    lastBenefitRevokeAt: timestamp("lastBenefitRevokeAt"),
    paidAt: timestamp("paidAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orderNoUnique: uniqueIndex("orders_orderNo_unique").on(table.orderNo),
    orderIdempotencyKeyUnique: uniqueIndex("orders_idempotencyKey_unique").on(table.idempotencyKey),
  })
);

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const adminActionAuditLogs = mysqlTable("admin_action_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").references(() => users.id),
  actorRole: varchar("actorRole", { length: 32 }),
  actorAdminLevel: varchar("actorAdminLevel", { length: 32 }),
  actionType: varchar("actionType", { length: 96 }).notNull(),
  actionLabel: varchar("actionLabel", { length: 255 }).notNull(),
  actionStatus: mysqlEnum("actionStatus", ["success", "failed", "blocked"]).notNull().default("success"),
  resourceType: varchar("resourceType", { length: 64 }),
  resourceId: varchar("resourceId", { length: 128 }),
  resourceLabel: varchar("resourceLabel", { length: 255 }),
  targetUserId: int("targetUserId").references(() => users.id),
  relatedOrderId: int("relatedOrderId").references(() => orders.id),
  snapshotId: int("snapshotId").references(() => systemConfigSnapshots.id),
  ipAddress: varchar("ipAddress", { length: 96 }),
  userAgent: varchar("userAgent", { length: 255 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminActionAuditLog = typeof adminActionAuditLogs.$inferSelect;
export type InsertAdminActionAuditLog = typeof adminActionAuditLogs.$inferInsert;

export const adminAlertNotifications = mysqlTable(
  "admin_alert_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    eventKey: varchar("eventKey", { length: 191 }).notNull(),
    auditLogId: int("auditLogId").notNull(),
    actionType: varchar("actionType", { length: 96 }).notNull(),
    severity: mysqlEnum("severity", ["warn", "critical"]).notNull().default("warn"),
    channel: mysqlEnum("channel", ["log", "inbox", "email", "webhook"]).notNull().default("log"),
    targetUserId: int("targetUserId").references(() => users.id),
    relatedOrderId: int("relatedOrderId").references(() => orders.id),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    actionUrl: varchar("actionUrl", { length: 512 }),
    recipient: varchar("recipient", { length: 320 }),
    payload: text("payload"),
    status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).notNull().default("pending"),
    attempts: int("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("lastAttemptAt"),
    sentAt: timestamp("sentAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("admin_alert_notifications_eventKey_unique").on(table.eventKey),
    auditLogFk: foreignKey({
      name: "admin_alert_notifs_audit_log_fk",
      columns: [table.auditLogId],
      foreignColumns: [adminActionAuditLogs.id],
    }),
  })
);

export type AdminAlertNotification = typeof adminAlertNotifications.$inferSelect;
export type InsertAdminAlertNotification = typeof adminAlertNotifications.$inferInsert;


export const adminRiskIncidents = mysqlTable(
  "admin_risk_incidents",
  {
    id: int("id").autoincrement().primaryKey(),
    auditLogId: int("auditLogId").notNull().references(() => adminActionAuditLogs.id),
    severity: mysqlEnum("severity", ["warn", "critical"]).notNull().default("warn"),
    riskScore: int("riskScore").default(0).notNull(),
    status: mysqlEnum("status", ["open", "acknowledged", "resolved"]).notNull().default("open"),
    escalationLevel: int("escalationLevel").default(0).notNull(),
    slaStatus: mysqlEnum("slaStatus", ["on_track", "due_soon", "breached", "resolved"]).notNull().default("on_track"),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    payload: text("payload"),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    lastEscalatedAt: timestamp("lastEscalatedAt"),
    ownerUserId: int("ownerUserId").references(() => users.id),
    ownerAssignedAt: timestamp("ownerAssignedAt"),
    ackDueAt: timestamp("ackDueAt"),
    resolveDueAt: timestamp("resolveDueAt"),
    acknowledgedAt: timestamp("acknowledgedAt"),
    acknowledgedByUserId: int("acknowledgedByUserId").references(() => users.id),
    resolvedAt: timestamp("resolvedAt"),
    resolvedByUserId: int("resolvedByUserId").references(() => users.id),
    handlingNote: text("handlingNote"),
    playbookId: int("playbookId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    auditLogUnique: uniqueIndex("admin_risk_incidents_auditLogId_unique").on(table.auditLogId),
  })
);

export type AdminRiskIncident = typeof adminRiskIncidents.$inferSelect;
export type InsertAdminRiskIncident = typeof adminRiskIncidents.$inferInsert;


export const adminRiskPlaybooks = mysqlTable(
  "admin_risk_playbooks",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    triggerSeverity: mysqlEnum("triggerSeverity", ["all", "warn", "critical"]).notNull().default("all"),
    actionType: varchar("actionType", { length: 96 }),
    resourceType: varchar("resourceType", { length: 64 }),
    summary: text("summary"),
    checklist: text("checklist"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeUnique: uniqueIndex("admin_risk_playbooks_code_unique").on(table.code),
  })
);

export type AdminRiskPlaybook = typeof adminRiskPlaybooks.$inferSelect;
export type InsertAdminRiskPlaybook = typeof adminRiskPlaybooks.$inferInsert;

export const adminRiskAutomationRules = mysqlTable(
  "admin_risk_automation_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    triggerSeverity: mysqlEnum("triggerSeverity", ["all", "warn", "critical"]).notNull().default("all"),
    actionType: varchar("actionType", { length: 96 }),
    resourceType: varchar("resourceType", { length: 64 }),
    minRiskScore: int("minRiskScore").default(0).notNull(),
    playbookId: int("playbookId"),
    autoAcknowledge: boolean("autoAcknowledge").notNull().default(false),
    autoEscalate: boolean("autoEscalate").notNull().default(false),
    executionNote: text("executionNote"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type AdminRiskAutomationRule = typeof adminRiskAutomationRules.$inferSelect;
export type InsertAdminRiskAutomationRule = typeof adminRiskAutomationRules.$inferInsert;

export const adminRiskRuleExecutions = mysqlTable(
  "admin_risk_rule_executions",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentId: int("incidentId").notNull().references(() => adminRiskIncidents.id),
    ruleId: int("ruleId").notNull(),
    playbookId: int("playbookId"),
    status: mysqlEnum("status", ["matched", "executed", "skipped", "failed"]).notNull().default("matched"),
    executionSummary: text("executionSummary"),
    payload: text("payload"),
    executedAt: timestamp("executedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ruleFk: foreignKey({
      name: "risk_rule_exec_rule_fk",
      columns: [table.ruleId],
      foreignColumns: [adminRiskAutomationRules.id],
    }),
  })
);

export type AdminRiskRuleExecution = typeof adminRiskRuleExecutions.$inferSelect;
export type InsertAdminRiskRuleExecution = typeof adminRiskRuleExecutions.$inferInsert;



export const adminRiskSlaPolicies = mysqlTable(
  "admin_risk_sla_policies",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    triggerSeverity: mysqlEnum("triggerSeverity", ["all", "warn", "critical"]).notNull().default("all"),
    actionType: varchar("actionType", { length: 96 }),
    resourceType: varchar("resourceType", { length: 64 }),
    acknowledgeMinutes: int("acknowledgeMinutes").default(15).notNull(),
    resolveMinutes: int("resolveMinutes").default(120).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type AdminRiskSlaPolicy = typeof adminRiskSlaPolicies.$inferSelect;
export type InsertAdminRiskSlaPolicy = typeof adminRiskSlaPolicies.$inferInsert;

export const adminRiskOncallAssignments = mysqlTable(
  "admin_risk_oncall_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    userId: int("userId").notNull().references(() => users.id),
    triggerSeverity: mysqlEnum("triggerSeverity", ["all", "warn", "critical"]).notNull().default("all"),
    actionType: varchar("actionType", { length: 96 }),
    resourceType: varchar("resourceType", { length: 64 }),
    isPrimary: boolean("isPrimary").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type AdminRiskOncallAssignment = typeof adminRiskOncallAssignments.$inferSelect;
export type InsertAdminRiskOncallAssignment = typeof adminRiskOncallAssignments.$inferInsert;

export const paymentCallbacks = mysqlTable(
  "payment_callbacks",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: mysqlEnum("provider", ["wechat", "alipay", "custom", "manual"]).notNull().default("custom"),
    callbackKey: varchar("callbackKey", { length: 191 }).notNull(),
    eventId: varchar("eventId", { length: 128 }),
    orderNo: varchar("orderNo", { length: 64 }),
    relatedOrderId: int("relatedOrderId").references(() => orders.id),
    providerTradeNo: varchar("providerTradeNo", { length: 128 }),
    amountCents: int("amountCents").default(0).notNull(),
    status: mysqlEnum("status", ["paid", "failed", "cancelled", "refunded"]).notNull().default("paid"),
    signatureVerified: boolean("signatureVerified").notNull().default(false),
    payload: text("payload"),
    resultStatus: mysqlEnum("resultStatus", ["received", "applied", "duplicate", "rejected", "ignored", "error"]).notNull().default("received"),
    resultMessage: text("resultMessage"),
    processedAt: timestamp("processedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    callbackKeyUnique: uniqueIndex("payment_callbacks_callbackKey_unique").on(table.callbackKey),
  })
);

export type PaymentCallback = typeof paymentCallbacks.$inferSelect;
export type InsertPaymentCallback = typeof paymentCallbacks.$inferInsert;

export const paymentNotifications = mysqlTable(
  "payment_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    eventKey: varchar("eventKey", { length: 191 }).notNull(),
    eventType: mysqlEnum("eventType", ["payment_paid", "payment_failed", "payment_cancelled", "payment_refunded", "benefits_repaired", "benefits_revoked", "admin_audit_alert"]).notNull(),
    channel: mysqlEnum("channel", ["log", "owner", "webhook"]).notNull().default("log"),
    relatedOrderId: int("relatedOrderId").references(() => orders.id),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    recipient: varchar("recipient", { length: 255 }),
    payload: text("payload"),
    status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).notNull().default("pending"),
    attempts: int("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("lastAttemptAt"),
    sentAt: timestamp("sentAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("payment_notifications_eventKey_unique").on(table.eventKey),
  })
);

export type PaymentNotification = typeof paymentNotifications.$inferSelect;
export type InsertPaymentNotification = typeof paymentNotifications.$inferInsert;


export const userNotifications = mysqlTable(
  "user_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    eventKey: varchar("eventKey", { length: 191 }).notNull(),
    userId: int("userId").notNull().references(() => users.id),
    eventType: mysqlEnum("eventType", ["payment_paid", "payment_failed", "payment_cancelled", "payment_refunded", "benefits_repaired", "benefits_revoked", "admin_audit_alert"]).notNull(),
    relatedOrderId: int("relatedOrderId").references(() => orders.id),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    actionUrl: varchar("actionUrl", { length: 512 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("user_notifications_eventKey_unique").on(table.eventKey),
  })
);

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

export const emailDeliveries = mysqlTable(
  "email_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    eventKey: varchar("eventKey", { length: 191 }).notNull(),
    eventType: mysqlEnum("eventType", ["payment_paid", "payment_failed", "payment_cancelled", "payment_refunded", "benefits_repaired", "benefits_revoked", "admin_audit_alert", "system_test"]).notNull(),
    userId: int("userId").references(() => users.id),
    relatedOrderId: int("relatedOrderId").references(() => orders.id),
    provider: mysqlEnum("provider", ["log", "webhook", "resend"]).notNull().default("log"),
    recipientEmail: varchar("recipientEmail", { length: 320 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    contentText: text("contentText").notNull(),
    contentHtml: text("contentHtml"),
    payload: text("payload"),
    status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).notNull().default("pending"),
    attempts: int("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("lastAttemptAt"),
    sentAt: timestamp("sentAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("email_deliveries_eventKey_unique").on(table.eventKey),
  })
);

export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type InsertEmailDelivery = typeof emailDeliveries.$inferInsert;

export const paymentSessions = mysqlTable(
  "payment_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull().references(() => orders.id),
    provider: mysqlEnum("provider", ["mock", "manual", "wechat", "alipay"]).notNull().default("mock"),
    channel: mysqlEnum("channel", ["native", "page", "jsapi", "wap", "manual"]).notNull().default("manual"),
    status: mysqlEnum("status", ["created", "awaiting_action", "pending_callback", "paid", "failed", "cancelled", "expired"]).notNull().default("created"),
    providerSessionId: varchar("providerSessionId", { length: 128 }),
    checkoutToken: varchar("checkoutToken", { length: 128 }).notNull(),
    redirectUrl: text("redirectUrl"),
    codeUrl: text("codeUrl"),
    displayContent: text("displayContent"),
    expiresAt: timestamp("expiresAt"),
    requestPayload: text("requestPayload"),
    responsePayload: text("responsePayload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    checkoutTokenUnique: uniqueIndex("payment_sessions_checkoutToken_unique").on(table.checkoutToken),
  })
);

export type PaymentSession = typeof paymentSessions.$inferSelect;
export type InsertPaymentSession = typeof paymentSessions.$inferInsert;

export const userSubscriptions = mysqlTable("user_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  productId: int("productId").references(() => products.id),
  orderId: int("orderId").references(() => orders.id),
  planName: varchar("planName", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["active", "expired", "cancelled"]).notNull().default("active"),
  startAt: timestamp("startAt").defaultNow().notNull(),
  endAt: timestamp("endAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = typeof userSubscriptions.$inferInsert;

export const userEntitlements = mysqlTable(
  "user_entitlements",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    entitlementType: mysqlEnum("entitlementType", ["course", "vip"]).notNull(),
    courseId: int("courseId").references(() => courses.id),
    sourceType: mysqlEnum("sourceType", ["order", "admin", "system"]).notNull().default("order"),
    orderId: int("orderId").references(() => orders.id),
    subscriptionId: int("subscriptionId").references(() => userSubscriptions.id),
    startsAt: timestamp("startsAt").defaultNow().notNull(),
    endsAt: timestamp("endsAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userEntitlementUnique: uniqueIndex("user_entitlements_unique").on(
      table.userId,
      table.entitlementType,
      table.courseId
    ),
  })
);

export type UserEntitlement = typeof userEntitlements.$inferSelect;
export type InsertUserEntitlement = typeof userEntitlements.$inferInsert;


export const transcodeJobs = mysqlTable(
  "transcode_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    mediaId: int("mediaId").notNull().references(() => mediaAssets.id),
    requestedBy: int("requestedBy").references(() => users.id),
    provider: mysqlEnum("provider", ["manual", "webhook", "custom"]).notNull().default("manual"),
    status: mysqlEnum("status", ["queued", "dispatched", "processing", "succeeded", "failed", "cancelled"]).notNull().default("queued"),
    profile: varchar("profile", { length: 64 }).notNull().default("adaptive-720p"),
    outputPrefix: varchar("outputPrefix", { length: 512 }),
    callbackToken: varchar("callbackToken", { length: 128 }).notNull(),
    externalJobId: varchar("externalJobId", { length: 128 }),
    progress: int("progress").default(0).notNull(),
    errorMessage: text("errorMessage"),
    requestPayload: text("requestPayload"),
    responsePayload: text("responsePayload"),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    callbackTokenUnique: uniqueIndex("transcode_jobs_callbackToken_unique").on(table.callbackToken),
  })
);

export type TranscodeJob = typeof transcodeJobs.$inferSelect;
export type InsertTranscodeJob = typeof transcodeJobs.$inferInsert;
