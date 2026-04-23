import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm.js";
import {
  AuthLoginError,
  sendEmailLoginCode,
  sendPhoneLoginCode,
  verifyEmailLoginCode,
  verifyPhoneLoginCode,
} from "./authLogin.js";
import {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  getCourses,
  getCourseBySlug,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  searchCoursesByText,
  getChaptersByCourseId,
  createChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
  getCommentsByCourseId,
  createComment,
  deleteComment,
  getAllComments,
  updateCommentStatus,
  getStats,
  createMediaAsset,
  deleteMediaAsset,
  getMediaAssets,
  getMediaDeliveryUrl,
  updateMediaAssetPlaybackMeta,
  queueMediaAssetTranscode,
  listTranscodeJobs,
  retryTranscodeJob,
  applyTranscodeJobCallback,
  getCourseProgress,
  saveCoursePlayback,
  completeCourseChapter,
  getMyLearningOverview,
  incrementCourseView,
  getFavoriteStatus,
  toggleFavorite,
  listFavoriteCourses,
  getHomepageSettings,
  upsertHomepageSettings,
  getHomepageBanners,
  createHomepageBanner,
  updateHomepageBanner,
  deleteHomepageBanner,
  reorderHomepageBanners,
  getProducts,
  getCourseProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  listOrdersByUser,
  listOrdersAdmin,
  markOrderPaid,
  payOrderByMock,
  cancelOrder,
  getMyAccessSummary,
  getMyCommerceOverview,
  getCheckoutStatusForUser,
  listPaymentCallbacks,
  repairOrderBenefits,
  refundOrder,
  listPaymentNotifications,
  retryPaymentNotification,
  listUserNotifications,
  markUserNotificationsRead,
  getUnreadUserNotificationCount,
  listEmailDeliveriesByUser,
  getSystemConfigOverview,
  upsertSystemSetting,
  clearSystemSetting,
  sendSystemTestEmail,
  listSystemConfigAuditLogs,
  listSystemConfigSnapshots,
  exportSystemConfigSnapshot,
  previewSystemConfigSnapshotImport,
  importSystemConfigSnapshot,
  getSystemConfigSnapshotDownload,
  restoreSystemConfigSnapshot,
  listUserAccessAccounts,
  updateUserAdminAccess,
  appendAdminActionAuditLog,
  listAdminActionAuditLogs,
  getAdminActionAuditOverview,
  listAdminAlertNotifications,
  getAdminAlertOverview,
  retryAdminAlertNotification,
  getAdminRiskOverview,
  listAdminRiskIncidents,
  acknowledgeAdminRiskIncident,
  resolveAdminRiskIncident,
  escalateAdminRiskIncident,
  listAdminRiskPlaybooks,
  upsertAdminRiskPlaybook,
  deleteAdminRiskPlaybook,
  listAdminRiskAutomationRules,
  upsertAdminRiskAutomationRule,
  deleteAdminRiskAutomationRule,
  listAdminRiskRuleExecutions,
  applyAdminRiskAutomation,
  listAdminRiskSlaPolicies,
  upsertAdminRiskSlaPolicy,
  deleteAdminRiskSlaPolicy,
  listAdminRiskOncallAssignments,
  upsertAdminRiskOncallAssignment,
  deleteAdminRiskOncallAssignment,
  listAdminRiskAssignableUsers,
  assignAdminRiskIncidentOwner,
  claimAdminRiskIncident,
  listUserIdentitiesByUserId,
} from "./db.js";
import { saveUploadedBase64File } from "./uploads.js";
import { createDirectUploadUrl, storageSupportsDirectUpload } from "./storage.js";
import { issuePlaybackTicket } from "./playbackTickets.js";
import { dispatchTranscodeJob } from "./transcode.js";
import { createCheckoutForOrder, getPaymentGatewayOverview } from "./paymentGateway.js";
import { buildSystemCategorySummary } from "./systemConfigCatalog.js";
import { ENV, isSmsDeliveryReady, isWeChatLoginReady } from "./_core/env.js";
import { sdk } from "./_core/sdk.js";
import { AdminPermission, AdminLevel, getDangerousConfirmPhrase, hasAdminPermission, getEffectiveAdminLevel, listAdminPermissions } from "../shared/adminAccess.js";

const requireAdminPermission = (permission: AdminPermission) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!hasAdminPermission(ctx.user, permission, ENV.ownerOpenId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Admin permission required: ${permission}` });
    }
    return next({
      ctx: {
        ...ctx,
        adminLevel: getEffectiveAdminLevel(ctx.user, ENV.ownerOpenId),
        adminPermissions: listAdminPermissions(ctx.user, ENV.ownerOpenId),
      },
    });
  });

const dashboardViewProcedure = requireAdminPermission("dashboard.view");
const categoriesManageProcedure = requireAdminPermission("categories.manage");
const coursesManageProcedure = requireAdminPermission("courses.manage");
const mediaManageProcedure = requireAdminPermission("media.manage");
const commentsModerateProcedure = requireAdminPermission("comments.moderate");
const siteManageProcedure = requireAdminPermission("site.manage");
const productsManageProcedure = requireAdminPermission("products.manage");
const commerceViewProcedure = requireAdminPermission("commerce.view");
const commerceManageProcedure = requireAdminPermission("commerce.manage");
const systemViewProcedure = requireAdminPermission("system.view");
const systemManageProcedure = requireAdminPermission("system.manage");
const accessManageProcedure = requireAdminPermission("access.manage");

function assertDangerousConfirmation(confirmText: string | undefined, actionKey: Parameters<typeof getDangerousConfirmPhrase>[0]) {
  const expected = getDangerousConfirmPhrase(actionKey);
  if ((confirmText ?? "").trim() !== expected) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Dangerous action confirmation mismatch. Expected: ${expected}` });
  }
}

function getRequestIp(req: any) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).split(",")[0].trim();
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req?.ip || req?.socket?.remoteAddress || null;
}

function getRequestUserAgent(req: any) {
  const raw = req?.headers?.["user-agent"];
  if (!raw) return null;
  return Array.isArray(raw) ? String(raw[0]) : String(raw);
}

function maskIdentityValue(provider: string, value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  if (provider.includes("email") || normalized.includes("@")) {
    const [localPart, domain = ""] = normalized.split("@");
    const visible = localPart.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(localPart.length - visible.length, 1))}@${domain}`;
  }
  if (provider.includes("phone") || /^\+?\d{7,}$/.test(normalized)) {
    if (normalized.length <= 7) return `${normalized.slice(0, 2)}***`;
    return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  }
  if (normalized.length <= 6) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function getAuthAvailableMethods() {
  const emailEnabled =
    ENV.emailDeliveryMode === "log" ||
    Boolean(
      (ENV.emailDeliveryMode === "resend" &&
        ENV.resendApiKey &&
        ENV.emailFromAddress) ||
        (ENV.emailDeliveryMode === "webhook" && ENV.emailWebhookUrl)
    );
  const phoneEnabled = isSmsDeliveryReady();
  const wechatEnabled = isWeChatLoginReady();
  const legacyOauthEnabled = Boolean(ENV.oAuthServerUrl && ENV.appId);

  return {
    wechat: {
      enabled: wechatEnabled,
      kind: "redirect" as const,
    },
    phone: {
      enabled: phoneEnabled,
      kind: "otp" as const,
    },
    email: {
      enabled: emailEnabled,
      kind: "otp" as const,
    },
    legacyOAuth: {
      enabled: legacyOauthEnabled,
      kind: "redirect" as const,
    },
  };
}

function throwAuthLoginError(error: unknown): never {
  if (error instanceof AuthLoginError) {
    throw new TRPCError({
      code: error.code,
      message: error.message,
    });
  }
  throw error;
}

async function recordAdminAudit(ctx: any, input: {
  actionType: string;
  actionLabel: string;
  actionStatus?: "success" | "failed" | "blocked";
  resourceType?: string | null;
  resourceId?: string | number | null;
  resourceLabel?: string | null;
  targetUserId?: number | null;
  relatedOrderId?: number | null;
  snapshotId?: number | null;
  metadata?: unknown;
}) {
  try {
    await appendAdminActionAuditLog({
      actorUserId: ctx?.user?.id ?? null,
      actorRole: ctx?.user?.role ?? null,
      actorAdminLevel: ctx?.adminLevel ?? ctx?.user?.adminLevel ?? null,
      ipAddress: getRequestIp(ctx?.req),
      userAgent: getRequestUserAgent(ctx?.req),
      ...input,
    });
  } catch (error) {
    console.error("[AdminAudit] Failed to persist audit log", error);
  }
}

function getAuditStatusFromError(error: unknown): "failed" | "blocked" {
  if (error instanceof TRPCError && error.code === "FORBIDDEN") return "blocked";
  return "failed";
}

const courseWriteSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  coverUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  categoryId: z.number().optional().nullable(),
  duration: z.number().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  status: z.enum(["draft", "published"]).optional(),
  accessType: z.enum(["free", "login", "vip", "paid"]).optional(),
  trialChapterCount: z.number().min(0).optional(),
  priceCents: z.number().min(0).optional(),
  featured: z.boolean().optional(),
  featuredOrder: z.number().min(0).optional(),
  instructor: z.string().optional(),
  tags: z.string().optional(),
});

const homepageSettingsSchema = z.object({
  heroBadge: z.string().min(1),
  heroTitle: z.string().min(1),
  heroSubtitle: z.string().min(1),
  primaryButtonText: z.string().min(1),
  secondaryButtonText: z.string().min(1),
  featuredTitle: z.string().min(1),
  featuredSubtitle: z.string().min(1),
});

const homepageBannerSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().min(0).optional(),
});

const mediaAccessSchema = z.enum(["public", "protected"]);
const transcodeStatusSchema = z.enum(["none", "queued", "processing", "ready", "failed"]);
const mediaPlaybackMetaSchema = z.object({
  posterUrl: z.string().optional().nullable(),
  hlsManifestKey: z.string().optional().nullable(),
  hlsManifestUrl: z.string().optional().nullable(),
  transcodeStatus: transcodeStatusSchema.optional(),
  transcodeJobId: z.string().optional().nullable(),
});

const transcodeCallbackApplySchema = z.object({
  jobId: z.number(),
  status: z.enum(["processing", "ready", "failed", "cancelled"]),
  progress: z.number().min(0).max(100).optional(),
  externalJobId: z.string().optional().nullable(),
  posterUrl: z.string().optional().nullable(),
  hlsManifestKey: z.string().optional().nullable(),
  hlsManifestUrl: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
});

const productWriteSchema = z.object({
  type: z.enum(["course", "vip"]),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  courseId: z.number().optional().nullable(),
  priceCents: z.number().min(0),
  durationDays: z.number().min(1).optional().nullable(),
  coverUrl: z.string().optional(),
  sortOrder: z.number().min(0).optional(),
});

const orderStatusSchema = z.enum(["pending", "paid", "cancelled", "refunded", "all"]);

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    availableMethods: publicProcedure.query(() => getAuthAvailableMethods()),
    identities: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listUserIdentitiesByUserId(ctx.user.id);
      return rows.map((row) => {
        const displaySource =
          row.phone || row.email || row.providerUnionId || row.providerUserId;
        return {
          id: row.id,
          provider: row.provider,
          displayName: row.displayName ?? null,
          avatarUrl: row.avatarUrl ?? null,
          verifiedAt: row.verifiedAt ?? null,
          lastUsedAt: row.lastUsedAt ?? null,
          maskedIdentifier: maskIdentityValue(row.provider, displaySource),
          isPrimary: row.provider === "manus_oauth_legacy",
        };
      });
    }),
    phone: router({
      sendCode: publicProcedure
        .input(
          z.object({
            phone: z.string().min(1).max(32),
          })
        )
        .mutation(async ({ input, ctx }) => {
          try {
            const result = await sendPhoneLoginCode({
              phone: input.phone,
              requestIp: getRequestIp(ctx.req),
              userAgent: getRequestUserAgent(ctx.req),
            });
            return {
              success: true as const,
              cooldownSeconds: result.cooldownSeconds,
              expiresAt: result.expiresAt,
            };
          } catch (error) {
            throwAuthLoginError(error);
          }
        }),
      verifyCode: publicProcedure
        .input(
          z.object({
            phone: z.string().min(1).max(32),
            code: z.string().regex(/^\d{4,8}$/),
          })
        )
        .mutation(async ({ input, ctx }) => {
          try {
            const user = await verifyPhoneLoginCode({
              phone: input.phone,
              code: input.code,
              requestIp: getRequestIp(ctx.req),
              userAgent: getRequestUserAgent(ctx.req),
            });
            const token = await sdk.createUserSessionToken(user.id, {
              name: user.name || user.phone || user.email || user.openId,
              openId: user.openId,
              sessionVersion: user.sessionVersion ?? 0,
              expiresInMs: ONE_YEAR_MS,
            });
            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, token, {
              ...cookieOptions,
              maxAge: ONE_YEAR_MS,
            });
            return {
              success: true as const,
              user,
            };
          } catch (error) {
            throwAuthLoginError(error);
          }
        }),
    }),
    email: router({
      sendCode: publicProcedure
        .input(
          z.object({
            email: z.string().email(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          try {
            const result = await sendEmailLoginCode({
              email: input.email,
              requestIp: getRequestIp(ctx.req),
              userAgent: getRequestUserAgent(ctx.req),
            });
            return {
              success: true as const,
              cooldownSeconds: result.cooldownSeconds,
              expiresAt: result.expiresAt,
            };
          } catch (error) {
            throwAuthLoginError(error);
          }
        }),
      verifyCode: publicProcedure
        .input(
          z.object({
            email: z.string().email(),
            code: z.string().regex(/^\d{4,8}$/),
          })
        )
        .mutation(async ({ input, ctx }) => {
          try {
            const user = await verifyEmailLoginCode({
              email: input.email,
              code: input.code,
              requestIp: getRequestIp(ctx.req),
              userAgent: getRequestUserAgent(ctx.req),
            });
            const token = await sdk.createUserSessionToken(user.id, {
              name: user.name || user.email || user.phone || user.openId,
              openId: user.openId,
              sessionVersion: user.sessionVersion ?? 0,
              expiresInMs: ONE_YEAR_MS,
            });
            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, token, {
              ...cookieOptions,
              maxAge: ONE_YEAR_MS,
            });
            return {
              success: true as const,
              user,
            };
          } catch (error) {
            throwAuthLoginError(error);
          }
        }),
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  category: router({
    list: publicProcedure.query(() => getCategories()),
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => getCategoryBySlug(input.slug)),
    create: categoriesManageProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slug: z.string().min(1),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createCategory(input);
        await recordAdminAudit(ctx, {
          actionType: "category.create",
          actionLabel: "创建分类",
          resourceType: "category",
          resourceId: result?.id ?? input.slug,
          resourceLabel: result?.name ?? input.name,
          metadata: { slug: result?.slug ?? input.slug },
        });
        return result;
      }),
    update: categoriesManageProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          slug: z.string().min(1).optional(),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateCategory(id, data);
        await recordAdminAudit(ctx, {
          actionType: "category.update",
          actionLabel: "更新分类",
          resourceType: "category",
          resourceId: id,
          resourceLabel: result?.name ?? null,
          metadata: { changedFields: Object.keys(data) },
        });
        return result;
      }),
    delete: categoriesManageProcedure
      .input(z.object({ id: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "category.delete");
        const result = await deleteCategory(input.id);
        await recordAdminAudit(ctx, {
          actionType: "category.delete",
          actionLabel: "删除分类",
          resourceType: "category",
          resourceId: input.id,
        });
        return result;
      }),
  }),

  course: router({
    list: publicProcedure
      .input(
        z.object({
          categorySlug: z.string().optional(),
          search: z.string().optional(),
          level: z.enum(["beginner", "intermediate", "advanced", "all"]).optional().default("all"),
          featuredOnly: z.boolean().optional().default(false),
          status: z.enum(["draft", "published", "all"]).optional().default("published"),
          page: z.number().optional().default(1),
          limit: z.number().optional().default(20),
        })
      )
      .query(({ input }) => getCourses(input)),
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => getCourseBySlug(input.slug)),
    getById: coursesManageProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getCourseById(input.id)),
    create: coursesManageProcedure.input(courseWriteSchema).mutation(({ input }) => createCourse(input)),
    update: coursesManageProcedure
      .input(courseWriteSchema.partial().extend({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateCourse(id, data);
        await recordAdminAudit(ctx, {
          actionType: "course.update",
          actionLabel: "更新课程",
          resourceType: "course",
          resourceId: id,
          resourceLabel: result?.title ?? null,
          metadata: { changedFields: Object.keys(data), status: result?.status ?? null },
        });
        return result;
      }),
    delete: coursesManageProcedure
      .input(z.object({ id: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "course.delete");
        const result = await deleteCourse(input.id);
        await recordAdminAudit(ctx, {
          actionType: "course.delete",
          actionLabel: "删除课程",
          resourceType: "course",
          resourceId: input.id,
        });
        return result;
      }),
    recordView: publicProcedure
      .input(z.object({ courseId: z.number() }))
      .mutation(({ input }) => incrementCourseView(input.courseId)),
  }),

  chapter: router({
    listByCourse: publicProcedure
      .input(z.object({ courseId: z.number() }))
      .query(({ input }) => getChaptersByCourseId(input.courseId)),
    create: coursesManageProcedure
      .input(
        z.object({
          courseId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          videoUrl: z.string().optional(),
          duration: z.number().optional(),
          sortOrder: z.number().optional(),
          isFree: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createChapter(input);
        await recordAdminAudit(ctx, {
          actionType: "chapter.create",
          actionLabel: "创建章节",
          resourceType: "chapter",
          resourceId: result?.id ?? null,
          resourceLabel: result?.title ?? input.title,
          metadata: { courseId: input.courseId },
        });
        return result;
      }),
    update: coursesManageProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          videoUrl: z.string().optional(),
          duration: z.number().optional(),
          sortOrder: z.number().optional(),
          isFree: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateChapter(id, data);
        await recordAdminAudit(ctx, {
          actionType: "chapter.update",
          actionLabel: "更新章节",
          resourceType: "chapter",
          resourceId: id,
          resourceLabel: result?.title ?? null,
          metadata: { changedFields: Object.keys(data), courseId: result?.courseId ?? null },
        });
        return result;
      }),
    reorder: coursesManageProcedure
      .input(
        z.object({
          courseId: z.number(),
          items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await reorderChapters(input.courseId, input.items);
        await recordAdminAudit(ctx, {
          actionType: "chapter.reorder",
          actionLabel: "排序章节",
          resourceType: "course",
          resourceId: input.courseId,
          metadata: { itemCount: input.items.length },
        });
        return result;
      }),
    delete: coursesManageProcedure
      .input(z.object({ id: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "chapter.delete");
        const result = await deleteChapter(input.id);
        await recordAdminAudit(ctx, {
          actionType: "chapter.delete",
          actionLabel: "删除章节",
          resourceType: "chapter",
          resourceId: input.id,
        });
        return result;
      }),
  }),

  comment: router({
    listByCourse: publicProcedure
      .input(z.object({ courseId: z.number() }))
      .query(({ input }) => getCommentsByCourseId(input.courseId)),
    create: protectedProcedure
      .input(
        z.object({
          courseId: z.number(),
          content: z.string().min(1),
          rating: z.number().min(1).max(5).optional().default(5),
          parentId: z.number().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        createComment({
          ...input,
          userId: ctx.user.id,
          status: ctx.user.role === "admin" ? "approved" : "pending",
          rating: input.parentId ? 0 : input.rating,
        })
      ),
    delete: commentsModerateProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deleteComment(input.id);
        await recordAdminAudit(ctx, {
          actionType: "comment.delete",
          actionLabel: "删除评论",
          resourceType: "comment",
          resourceId: input.id,
        });
        return result;
      }),
    adminList: commentsModerateProcedure
      .input(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("all") }).optional())
      .query(({ input }) => getAllComments(input)),
    updateStatus: commentsModerateProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pending", "approved", "rejected"]) }))
      .mutation(async ({ input, ctx }) => {
        const result = await updateCommentStatus(input.id, input.status);
        await recordAdminAudit(ctx, {
          actionType: "comment.moderate",
          actionLabel: "审核评论",
          resourceType: "comment",
          resourceId: input.id,
          metadata: { status: input.status },
        });
        return result;
      }),
  }),

  favorite: router({
    status: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(({ input, ctx }) => getFavoriteStatus(ctx.user.id, input.courseId)),
    toggle: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .mutation(({ input, ctx }) => toggleFavorite(ctx.user.id, input.courseId)),
    list: protectedProcedure.query(({ ctx }) => listFavoriteCourses(ctx.user.id)),
  }),

  media: router({
    list: mediaManageProcedure
      .input(z.object({ type: z.enum(["image", "video", "file"]).optional() }).optional())
      .query(async ({ input }) => {
        const assets = await getMediaAssets(input ?? {});
        return assets.map((asset) => ({ ...asset, deliveryUrl: getMediaDeliveryUrl(asset) }));
      }),
    prepareUpload: mediaManageProcedure
      .input(
        z.object({
          type: z.enum(["image", "video", "file"]),
          fileName: z.string().min(1),
          contentType: z.string().min(1),
          size: z.number().min(1),
          duration: z.number().optional(),
          accessLevel: mediaAccessSchema.optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (!storageSupportsDirectUpload()) {
          return { mode: "inline" as const };
        }
        const folder = input.type === "image" ? "images" : input.type === "video" ? "videos" : "files";
        const upload = await createDirectUploadUrl({
          relKey: `${folder}/${input.fileName}`,
          contentType: input.contentType,
        });
        return {
          mode: "direct" as const,
          ...upload,
          accessLevel: input.accessLevel ?? (input.type === "image" ? "public" : "protected"),
          size: input.size,
          duration: input.duration,
          type: input.type,
          fileName: input.fileName,
          contentType: input.contentType,
        };
      }),
    completeUpload: mediaManageProcedure
      .input(
        z.object({
          type: z.enum(["image", "video", "file"]),
          fileName: z.string().min(1),
          contentType: z.string().min(1),
          size: z.number().min(1),
          storageKey: z.string().min(1),
          url: z.string().min(1),
          duration: z.number().optional(),
          accessLevel: mediaAccessSchema.optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const asset = await createMediaAsset({
          type: input.type,
          originName: input.fileName,
          storageKey: input.storageKey,
          url: input.url,
          mimeType: input.contentType,
          size: input.size,
          duration: input.duration,
          source: "storage",
          accessLevel: input.accessLevel ?? (input.type === "image" ? "public" : "protected"),
          createdBy: ctx.user.id,
        });
        await recordAdminAudit(ctx, {
          actionType: "media.create",
          actionLabel: "登记直传媒体",
          resourceType: "media",
          resourceId: asset?.id ?? null,
          resourceLabel: asset?.originName ?? input.fileName,
          metadata: { type: asset?.type ?? input.type, source: asset?.source ?? "storage" },
        });
        return { ...asset, deliveryUrl: getMediaDeliveryUrl(asset) };
      }),
    upload: mediaManageProcedure
      .input(
        z.object({
          type: z.enum(["image", "video", "file"]),
          fileName: z.string().min(1),
          contentType: z.string().min(1),
          base64: z.string().min(1),
          duration: z.number().optional(),
          accessLevel: mediaAccessSchema.optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const folder = input.type === "image" ? "images" : input.type === "video" ? "videos" : "files";
        const uploaded = await saveUploadedBase64File({
          base64: input.base64,
          fileName: input.fileName,
          contentType: input.contentType,
          folder,
          accessLevel: input.accessLevel ?? (input.type === "image" ? "public" : "protected"),
        });
        const asset = await createMediaAsset({
          type: input.type,
          originName: input.fileName,
          storageKey: uploaded.key ?? undefined,
          url: uploaded.url,
          mimeType: input.contentType,
          size: uploaded.size,
          duration: input.duration,
          source: uploaded.source,
          accessLevel: input.accessLevel ?? (input.type === "image" ? "public" : "protected"),
          createdBy: ctx.user.id,
        });
        await recordAdminAudit(ctx, {
          actionType: "media.create",
          actionLabel: "上传媒体",
          resourceType: "media",
          resourceId: asset?.id ?? null,
          resourceLabel: asset?.originName ?? input.fileName,
          metadata: { type: asset?.type ?? input.type, source: asset?.source ?? uploaded.source },
        });
        return { ...asset, deliveryUrl: getMediaDeliveryUrl(asset) };
      }),
    updatePlayback: mediaManageProcedure
      .input(z.object({ id: z.number() }).merge(mediaPlaybackMetaSchema))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const asset = await updateMediaAssetPlaybackMeta(id, data);
        await recordAdminAudit(ctx, {
          actionType: "media.update",
          actionLabel: "更新媒体播放元数据",
          resourceType: "media",
          resourceId: id,
          resourceLabel: asset?.originName ?? null,
          metadata: { changedFields: Object.keys(data) },
        });
        return asset ? { ...asset, deliveryUrl: getMediaDeliveryUrl(asset) } : null;
      }),
    queueTranscode: mediaManageProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const asset = await queueMediaAssetTranscode(input.id, ctx.user.id);
        await recordAdminAudit(ctx, {
          actionType: "media.transcode.queue",
          actionLabel: "创建转码任务",
          resourceType: "media",
          resourceId: input.id,
          resourceLabel: asset?.originName ?? null,
          metadata: { transcodeStatus: asset?.transcodeStatus ?? null },
        });
        return asset ? { ...asset, deliveryUrl: getMediaDeliveryUrl(asset) } : null;
      }),
    jobs: mediaManageProcedure
      .input(z.object({ mediaId: z.number().optional(), limit: z.number().min(1).max(50).optional() }).optional())
      .query(({ input }) => listTranscodeJobs(input ?? {})),
    dispatchTranscode: mediaManageProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await dispatchTranscodeJob(input.jobId);
        await recordAdminAudit(ctx, {
          actionType: "media.transcode.dispatch",
          actionLabel: "派发转码任务",
          resourceType: "transcode_job",
          resourceId: input.jobId,
          metadata: { status: (result as any)?.status ?? null, mediaId: (result as any)?.mediaId ?? null },
        });
        return result;
      }),
    retryTranscode: mediaManageProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await retryTranscodeJob(input.jobId, ctx.user.id);
        await recordAdminAudit(ctx, {
          actionType: "media.transcode.retry",
          actionLabel: "重试转码任务",
          resourceType: "transcode_job",
          resourceId: input.jobId,
          metadata: { status: (result as any)?.status ?? null, mediaId: (result as any)?.mediaId ?? null },
        });
        return result;
      }),
    applyTranscodeCallback: mediaManageProcedure
      .input(transcodeCallbackApplySchema)
      .mutation(({ input }) => applyTranscodeJobCallback(input)),
    delete: mediaManageProcedure
      .input(z.object({ id: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "media.delete");
        const result = await deleteMediaAsset(input.id);
        await recordAdminAudit(ctx, {
          actionType: "media.delete",
          actionLabel: "删除媒体",
          resourceType: "media",
          resourceId: input.id,
        });
        return result;
      }),
  }),

  playback: router({
    createTicket: publicProcedure
      .input(z.object({ mediaId: z.number(), preferHls: z.boolean().optional().default(true) }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await issuePlaybackTicket({
            mediaId: input.mediaId,
            preferHls: input.preferHls,
            userId: ctx.user?.id,
            userRole: ctx.user?.role,
          });
        } catch (error) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error instanceof Error ? error.message : "无法为当前媒体签发播放票据",
          });
        }
      }),
  }),

  progress: router({
    getCourse: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(({ input, ctx }) => getCourseProgress(ctx.user.id, input.courseId)),
    savePosition: protectedProcedure
      .input(
        z.object({
          courseId: z.number(),
          chapterId: z.number().optional(),
          positionSeconds: z.number().min(0),
        })
      )
      .mutation(({ input, ctx }) =>
        saveCoursePlayback({
          userId: ctx.user.id,
          courseId: input.courseId,
          chapterId: input.chapterId,
          positionSeconds: input.positionSeconds,
        })
      ),
    completeChapter: protectedProcedure
      .input(z.object({ courseId: z.number(), chapterId: z.number() }))
      .mutation(({ input, ctx }) =>
        completeCourseChapter({
          userId: ctx.user.id,
          courseId: input.courseId,
          chapterId: input.chapterId,
        })
      ),
    myOverview: protectedProcedure.query(({ ctx }) => getMyLearningOverview(ctx.user.id)),
  }),

  site: router({
    homepage: publicProcedure.query(() => getHomepageSettings()),
    updateHomepage: siteManageProcedure
      .input(homepageSettingsSchema)
      .mutation(async ({ input, ctx }) => {
        const result = await upsertHomepageSettings(input);
        await recordAdminAudit(ctx, {
          actionType: "site.homepage.update",
          actionLabel: "更新首页配置",
          resourceType: "site_homepage",
          resourceId: "homepage",
          metadata: { changedKeys: Object.keys(input) },
        });
        return result;
      }),
    bannerList: publicProcedure
      .input(z.object({ activeOnly: z.boolean().optional().default(true) }).optional())
      .query(({ input }) => getHomepageBanners({ activeOnly: input?.activeOnly ?? true })),
    createBanner: siteManageProcedure
      .input(homepageBannerSchema)
      .mutation(async ({ input, ctx }) => {
        const result = await createHomepageBanner(input);
        await recordAdminAudit(ctx, {
          actionType: "site.banner.create",
          actionLabel: "创建 Banner",
          resourceType: "homepage_banner",
          resourceId: result?.id ?? null,
          resourceLabel: result?.title ?? input.title,
        });
        return result;
      }),
    updateBanner: siteManageProcedure
      .input(homepageBannerSchema.partial().extend({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateHomepageBanner(id, data);
        await recordAdminAudit(ctx, {
          actionType: "site.banner.update",
          actionLabel: "更新 Banner",
          resourceType: "homepage_banner",
          resourceId: id,
          resourceLabel: result?.title ?? null,
          metadata: { changedFields: Object.keys(data) },
        });
        return result;
      }),
    reorderBanners: siteManageProcedure
      .input(z.object({ items: z.array(z.object({ id: z.number(), sortOrder: z.number() })) }))
      .mutation(async ({ input, ctx }) => {
        const result = await reorderHomepageBanners(input.items);
        await recordAdminAudit(ctx, {
          actionType: "site.banner.reorder",
          actionLabel: "排序 Banner",
          resourceType: "homepage_banner",
          resourceId: "batch",
          metadata: { itemCount: input.items.length },
        });
        return result;
      }),
    deleteBanner: siteManageProcedure
      .input(z.object({ id: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "site.banner.delete");
        const result = await deleteHomepageBanner(input.id);
        await recordAdminAudit(ctx, {
          actionType: "site.banner.delete",
          actionLabel: "删除 Banner",
          resourceType: "homepage_banner",
          resourceId: input.id,
        });
        return result;
      }),
  }),

  product: router({
    list: publicProcedure
      .input(
        z
          .object({
            activeOnly: z.boolean().optional().default(true),
            type: z.enum(["course", "vip"]).optional(),
            status: z.enum(["draft", "active", "archived", "all"]).optional(),
          })
          .optional()
      )
      .query(({ input }) => getProducts(input ?? {})),
    byCourse: publicProcedure
      .input(z.object({ courseId: z.number() }))
      .query(({ input }) => getCourseProduct(input.courseId)),
    create: productsManageProcedure.input(productWriteSchema).mutation(({ input }) => createProduct(input)),
    update: productsManageProcedure
      .input(productWriteSchema.partial().extend({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateProduct(id, data);
        await recordAdminAudit(ctx, {
          actionType: "product.update",
          actionLabel: "更新商品",
          resourceType: "product",
          resourceId: id,
          resourceLabel: result?.title ?? null,
          metadata: { changedFields: Object.keys(data) },
        });
        return result;
      }),
    delete: productsManageProcedure
      .input(z.object({ id: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "product.delete");
        const result = await deleteProduct(input.id);
        await recordAdminAudit(ctx, {
          actionType: "product.delete",
          actionLabel: "删除商品",
          resourceType: "product",
          resourceId: input.id,
        });
        return result;
      }),
  }),

  commerce: router({
    gatewayStatus: publicProcedure.query(() => getPaymentGatewayOverview()),
    myAccess: protectedProcedure.query(({ ctx }) => getMyAccessSummary(ctx.user.id)),
    overview: protectedProcedure.query(({ ctx }) => getMyCommerceOverview(ctx.user.id)),
    createOrder: protectedProcedure
      .input(z.object({ productId: z.number(), idempotencyKey: z.string().min(8).max(96).optional() }))
      .mutation(({ input, ctx }) => createOrder(ctx.user.id, input.productId, { idempotencyKey: input.idempotencyKey })),
    createCheckout: protectedProcedure
      .input(
        z.object({
          orderId: z.number(),
          provider: z.enum(["mock", "wechat", "alipay"]).default("alipay"),
          channel: z.enum(["native", "page", "manual"]).optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        createCheckoutForOrder({
          orderId: input.orderId,
          userId: ctx.user.id,
          provider: input.provider,
          channel: input.channel,
        })
      ),
    myOrders: protectedProcedure
      .input(z.object({ status: orderStatusSchema.optional().default("all") }).optional())
      .query(({ input, ctx }) => listOrdersByUser(ctx.user.id, { status: input?.status ?? "all" })),
    checkoutStatus: protectedProcedure
      .input(
        z
          .object({
            orderId: z.number().optional(),
            orderNo: z.string().trim().min(1).optional(),
            checkoutToken: z.string().trim().min(8).optional(),
          })
          .refine((value) => Boolean(value.orderId || value.orderNo || value.checkoutToken), {
            message: "至少需要提供 orderId、orderNo 或 checkoutToken 其中之一",
          })
      )
      .query(({ input, ctx }) => getCheckoutStatusForUser(ctx.user.id, input)),
    payMock: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(({ input, ctx }) => payOrderByMock(input.orderId, ctx.user.id)),
    cancelMyOrder: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(({ input, ctx }) => cancelOrder(input.orderId, { userId: ctx.user.id })),
    adminOrders: commerceViewProcedure
      .input(z.object({ status: orderStatusSchema.optional().default("all") }).optional())
      .query(({ input }) => listOrdersAdmin({ status: input?.status ?? "all" })),
    adminMarkPaid: commerceManageProcedure
      .input(z.object({ orderId: z.number(), paymentMethod: z.enum(["mock", "manual", "wechat", "alipay"]).optional().default("manual"), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "commerce.order.markPaid");
        const result = await markOrderPaid(input.orderId, input.paymentMethod);
        await recordAdminAudit(ctx, {
          actionType: "commerce.order.mark_paid",
          actionLabel: "后台标记订单支付",
          resourceType: "order",
          resourceId: input.orderId,
          relatedOrderId: input.orderId,
          metadata: { paymentMethod: input.paymentMethod, status: (result as any)?.status ?? null },
        });
        return result;
      }),
    adminRepairBenefits: commerceManageProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await repairOrderBenefits(input.orderId);
        await recordAdminAudit(ctx, {
          actionType: "commerce.order.repair_benefits",
          actionLabel: "补发订单权益",
          resourceType: "order",
          resourceId: input.orderId,
          relatedOrderId: input.orderId,
          metadata: { status: (result as any)?.status ?? null },
        });
        return result;
      }),
    adminRefund: commerceManageProcedure
      .input(
        z.object({
          orderId: z.number(),
          refundAmountCents: z.number().min(0).optional(),
          refundReason: z.string().max(500).optional(),
          paymentMethod: z.enum(["mock", "manual", "wechat", "alipay"]).optional().default("manual"),
          confirmText: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "commerce.order.refund");
        const result = await refundOrder(input.orderId, {
          paymentMethod: input.paymentMethod,
          refundAmountCents: input.refundAmountCents,
          refundReason: input.refundReason,
          paymentPayload: { source: "admin-refund" },
        });
        await recordAdminAudit(ctx, {
          actionType: "commerce.order.refund",
          actionLabel: "后台执行退款",
          resourceType: "order",
          resourceId: input.orderId,
          relatedOrderId: input.orderId,
          metadata: { paymentMethod: input.paymentMethod, refundAmountCents: input.refundAmountCents ?? null, reason: input.refundReason ?? null },
        });
        return result;
      }),
    adminPaymentCallbacks: commerceViewProcedure
      .input(z.object({ orderId: z.number().optional(), limit: z.number().min(1).max(100).optional() }).optional())
      .query(({ input }) => listPaymentCallbacks({ orderId: input?.orderId, limit: input?.limit })),
    adminNotifications: commerceViewProcedure
      .input(
        z
          .object({
            status: z.enum(["pending", "sent", "failed", "skipped", "all"]).optional().default("all"),
            channel: z.enum(["log", "owner", "webhook", "all"]).optional().default("all"),
            eventType: z.enum(["payment_paid", "payment_failed", "payment_cancelled", "payment_refunded", "benefits_repaired", "benefits_revoked", "all"]).optional().default("all"),
            limit: z.number().min(1).max(200).optional(),
          })
          .optional()
      )
      .query(({ input }) => listPaymentNotifications({
        status: input?.status ?? "all",
        channel: input?.channel ?? "all",
        eventType: input?.eventType ?? "all",
        limit: input?.limit,
      })),
    adminRetryNotification: commerceManageProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await retryPaymentNotification(input.notificationId);
        await recordAdminAudit(ctx, {
          actionType: "commerce.notification.retry",
          actionLabel: "重试支付通知",
          resourceType: "payment_notification",
          resourceId: input.notificationId,
          metadata: { status: (result as any)?.status ?? null },
        });
        return result;
      }),
    adminCancel: commerceManageProcedure
      .input(z.object({ orderId: z.number(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "commerce.order.cancel");
        const result = await cancelOrder(input.orderId, { admin: true });
        await recordAdminAudit(ctx, {
          actionType: "commerce.order.cancel",
          actionLabel: "后台取消订单",
          resourceType: "order",
          resourceId: input.orderId,
          relatedOrderId: input.orderId,
          metadata: { status: (result as any)?.status ?? null },
        });
        return result;
      }),
  }),

  adminAccess: router({
    users: accessManageProcedure
      .input(z.object({ role: z.enum(["user", "admin", "all"]).optional(), limit: z.number().min(1).max(500).optional() }).optional())
      .query(({ input }) => listUserAccessAccounts({ role: input?.role ?? "all", limit: input?.limit })),
    updateUser: accessManageProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]), adminLevel: z.enum(["support", "editor", "manager", "owner"]).nullable().optional(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "access.update");
        const result = await updateUserAdminAccess({
          userId: input.userId,
          role: input.role,
          adminLevel: (input.adminLevel ?? null) as AdminLevel | null,
        });
        await recordAdminAudit(ctx, {
          actionType: "access.user.update",
          actionLabel: "修改后台成员权限",
          resourceType: "user",
          resourceId: input.userId,
          targetUserId: input.userId,
          resourceLabel: result?.name ?? result?.email ?? result?.openId ?? null,
          metadata: { role: input.role, adminLevel: input.adminLevel ?? null },
        });
        return result;
      }),
  }),

  adminAudit: router({
    overview: systemViewProcedure.query(() => getAdminActionAuditOverview()),
    list: systemViewProcedure
      .input(
        z
          .object({
            limit: z.number().min(1).max(300).optional(),
            actionType: z.string().trim().min(1).optional(),
            resourceType: z.string().trim().min(1).optional(),
            actorUserId: z.number().optional(),
            actionStatus: z.enum(["success", "failed", "blocked", "all"]).optional().default("all"),
          })
          .optional()
      )
      .query(({ input }) => listAdminActionAuditLogs({
        limit: input?.limit,
        actionType: input?.actionType,
        resourceType: input?.resourceType,
        actorUserId: input?.actorUserId,
        actionStatus: input?.actionStatus,
      })),
  }),

  adminAlerts: router({
    overview: systemViewProcedure.query(() => getAdminAlertOverview()),
    list: systemViewProcedure
      .input(
        z
          .object({
            status: z.enum(["pending", "sent", "failed", "skipped", "all"]).optional().default("all"),
            channel: z.enum(["log", "inbox", "email", "webhook", "all"]).optional().default("all"),
            severity: z.enum(["warn", "critical", "all"]).optional().default("all"),
            limit: z.number().min(1).max(300).optional(),
          })
          .optional()
      )
      .query(({ input }) => listAdminAlertNotifications({
        status: input?.status ?? "all",
        channel: input?.channel ?? "all",
        severity: input?.severity ?? "all",
        limit: input?.limit,
      })),
    retry: systemManageProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await retryAdminAlertNotification(input.alertId);
        await recordAdminAudit(ctx, {
          actionType: "admin.alert.retry",
          actionLabel: "重试审计告警",
          resourceType: "admin_alert",
          resourceId: input.alertId,
          metadata: { status: (result as any)?.status ?? null, channel: (result as any)?.channel ?? null },
        });
        return result;
      }),
  }),

  adminRisk: router({
    overview: systemViewProcedure.query(() => getAdminRiskOverview()),
    list: systemViewProcedure
      .input(
        z
          .object({
            status: z.enum(["open", "acknowledged", "resolved", "all"]).optional().default("all"),
            severity: z.enum(["warn", "critical", "all"]).optional().default("all"),
            escalation: z.enum(["all", "none", "escalated"]).optional().default("all"),
            limit: z.number().min(1).max(300).optional(),
          })
          .optional()
      )
      .query(({ input }) => listAdminRiskIncidents({
        status: input?.status ?? "all",
        severity: input?.severity ?? "all",
        escalation: input?.escalation ?? "all",
        limit: input?.limit,
      })),
    acknowledge: systemManageProcedure
      .input(z.object({ incidentId: z.number(), note: z.string().max(2000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await acknowledgeAdminRiskIncident(input.incidentId, ctx.user.id, input.note ?? null);
        await recordAdminAudit(ctx, {
          actionType: "admin.risk.acknowledge",
          actionLabel: "确认风险事件",
          resourceType: "admin_risk_incident",
          resourceId: input.incidentId,
          metadata: { note: input.note ?? null },
        });
        return result;
      }),
    resolve: systemManageProcedure
      .input(z.object({ incidentId: z.number(), note: z.string().max(2000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await resolveAdminRiskIncident(input.incidentId, ctx.user.id, input.note ?? null);
        await recordAdminAudit(ctx, {
          actionType: "admin.risk.resolve",
          actionLabel: "关闭风险事件",
          resourceType: "admin_risk_incident",
          resourceId: input.incidentId,
          metadata: { note: input.note ?? null },
        });
        return result;
      }),
    escalate: systemManageProcedure
      .input(z.object({ incidentId: z.number(), note: z.string().max(2000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await escalateAdminRiskIncident(input.incidentId, ctx.user.id, input.note ?? null);
        await recordAdminAudit(ctx, {
          actionType: "admin.risk.escalate",
          actionLabel: "升级风险事件",
          resourceType: "admin_risk_incident",
          resourceId: input.incidentId,
          metadata: { note: input.note ?? null, escalationLevel: (result as any)?.escalationLevel ?? null },
        });
        return result;
      }),
    playbooks: systemViewProcedure.query(() => listAdminRiskPlaybooks()),
    upsertPlaybook: systemManageProcedure
      .input(z.object({ id: z.number().optional(), code: z.string().min(2).max(64), name: z.string().min(1).max(128), triggerSeverity: z.enum(["all", "warn", "critical"]), actionType: z.string().optional().nullable(), resourceType: z.string().optional().nullable(), summary: z.string().optional().nullable(), checklist: z.string().optional().nullable(), enabled: z.boolean().default(true) }))
      .mutation(async ({ input, ctx }) => {
        const row = await upsertAdminRiskPlaybook(input);
        await recordAdminAudit(ctx, { actionType: input.id ? "admin.risk.playbook.update" : "admin.risk.playbook.create", actionLabel: input.id ? "更新风险处置 SOP" : "创建风险处置 SOP", resourceType: "admin_risk_playbook", resourceId: row?.id ?? input.id ?? null, resourceLabel: input.name });
        return row;
      }),
    deletePlaybook: systemManageProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deleteAdminRiskPlaybook(input.id);
        await recordAdminAudit(ctx, { actionType: "admin.risk.playbook.delete", actionLabel: "删除风险处置 SOP", resourceType: "admin_risk_playbook", resourceId: input.id });
        return result;
      }),
    rules: systemViewProcedure.query(() => listAdminRiskAutomationRules()),
    slaPolicies: systemViewProcedure.query(() => listAdminRiskSlaPolicies()),
    upsertSlaPolicy: systemManageProcedure
      .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(128), triggerSeverity: z.enum(["all", "warn", "critical"]), actionType: z.string().optional().nullable(), resourceType: z.string().optional().nullable(), acknowledgeMinutes: z.number().min(1).max(10080), resolveMinutes: z.number().min(1).max(10080), enabled: z.boolean().default(true) }))
      .mutation(async ({ input, ctx }) => {
        const row = await upsertAdminRiskSlaPolicy(input);
        await recordAdminAudit(ctx, { actionType: input.id ? "admin.risk.sla.update" : "admin.risk.sla.create", actionLabel: input.id ? "更新风险 SLA 规则" : "创建风险 SLA 规则", resourceType: "admin_risk_sla_policy", resourceId: row?.id ?? input.id ?? null, resourceLabel: input.name });
        return row;
      }),
    deleteSlaPolicy: systemManageProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deleteAdminRiskSlaPolicy(input.id);
        await recordAdminAudit(ctx, { actionType: "admin.risk.sla.delete", actionLabel: "删除风险 SLA 规则", resourceType: "admin_risk_sla_policy", resourceId: input.id });
        return result;
      }),
    oncallAssignments: systemViewProcedure.query(() => listAdminRiskOncallAssignments()),
    oncallCandidates: systemViewProcedure.query(() => listAdminRiskAssignableUsers()),
    upsertOncallAssignment: systemManageProcedure
      .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(128), userId: z.number(), triggerSeverity: z.enum(["all", "warn", "critical"]), actionType: z.string().optional().nullable(), resourceType: z.string().optional().nullable(), isPrimary: z.boolean().default(false), enabled: z.boolean().default(true) }))
      .mutation(async ({ input, ctx }) => {
        const row = await upsertAdminRiskOncallAssignment(input);
        await recordAdminAudit(ctx, { actionType: input.id ? "admin.risk.oncall.update" : "admin.risk.oncall.create", actionLabel: input.id ? "更新风控值班指派" : "创建风控值班指派", resourceType: "admin_risk_oncall_assignment", resourceId: row?.id ?? input.id ?? null, resourceLabel: input.name, targetUserId: input.userId });
        return row;
      }),
    deleteOncallAssignment: systemManageProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deleteAdminRiskOncallAssignment(input.id);
        await recordAdminAudit(ctx, { actionType: "admin.risk.oncall.delete", actionLabel: "删除风控值班指派", resourceType: "admin_risk_oncall_assignment", resourceId: input.id });
        return result;
      }),
    upsertRule: systemManageProcedure
      .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(128), triggerSeverity: z.enum(["all", "warn", "critical"]), actionType: z.string().optional().nullable(), resourceType: z.string().optional().nullable(), minRiskScore: z.number().min(0).max(100), playbookId: z.number().optional().nullable(), autoAcknowledge: z.boolean().default(false), autoEscalate: z.boolean().default(false), executionNote: z.string().optional().nullable(), enabled: z.boolean().default(true) }))
      .mutation(async ({ input, ctx }) => {
        const row = await upsertAdminRiskAutomationRule(input);
        await recordAdminAudit(ctx, { actionType: input.id ? "admin.risk.rule.update" : "admin.risk.rule.create", actionLabel: input.id ? "更新风险自动化规则" : "创建风险自动化规则", resourceType: "admin_risk_rule", resourceId: row?.id ?? input.id ?? null, resourceLabel: input.name });
        return row;
      }),
    deleteRule: systemManageProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await deleteAdminRiskAutomationRule(input.id);
        await recordAdminAudit(ctx, { actionType: "admin.risk.rule.delete", actionLabel: "删除风险自动化规则", resourceType: "admin_risk_rule", resourceId: input.id });
        return result;
      }),
    executions: systemViewProcedure.input(z.object({ incidentId: z.number().optional() }).optional()).query(({ input }) => listAdminRiskRuleExecutions(input?.incidentId)),
    runAutomation: systemManageProcedure
      .input(z.object({ incidentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await applyAdminRiskAutomation(input.incidentId);
        await recordAdminAudit(ctx, { actionType: "admin.risk.rule.run", actionLabel: "手动执行风险自动化", resourceType: "admin_risk_incident", resourceId: input.incidentId, metadata: { count: result.length } });
        return result;
      }),
    assignOwner: systemManageProcedure
      .input(z.object({ incidentId: z.number(), ownerUserId: z.number(), note: z.string().max(2000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await assignAdminRiskIncidentOwner(input.incidentId, input.ownerUserId, input.note ?? null);
        await recordAdminAudit(ctx, { actionType: "admin.risk.assign", actionLabel: "指派风险事件负责人", resourceType: "admin_risk_incident", resourceId: input.incidentId, targetUserId: input.ownerUserId, metadata: { note: input.note ?? null } });
        return result;
      }),
    claim: systemManageProcedure
      .input(z.object({ incidentId: z.number(), note: z.string().max(2000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await claimAdminRiskIncident(input.incidentId, ctx.user.id, input.note ?? null);
        await recordAdminAudit(ctx, { actionType: "admin.risk.claim", actionLabel: "认领风险事件", resourceType: "admin_risk_incident", resourceId: input.incidentId, targetUserId: ctx.user.id, metadata: { note: input.note ?? null } });
        return result;
      }),
  }),

  systemConfig: router({
    overview: systemViewProcedure.query(() => getSystemConfigOverview()),
    runtimeStatus: systemViewProcedure.query(() => ({ ...buildSystemCategorySummary(), payments: getPaymentGatewayOverview() })),
    auditLogs: systemViewProcedure
      .input(z.object({ limit: z.number().min(1).max(200).optional(), settingKey: z.string().optional() }).optional())
      .query(({ input }) => listSystemConfigAuditLogs({ limit: input?.limit, settingKey: input?.settingKey })),
    snapshots: systemViewProcedure
      .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
      .query(({ input }) => listSystemConfigSnapshots({ limit: input?.limit })),
    exportSnapshot: systemViewProcedure
      .input(z.object({ name: z.string().optional(), description: z.string().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        const result = await exportSystemConfigSnapshot({ createdBy: ctx.user.id, name: input?.name, description: input?.description });
        await recordAdminAudit(ctx, {
          actionType: "system.snapshot.export",
          actionLabel: "导出系统配置快照",
          resourceType: "system_snapshot",
          resourceId: result?.snapshotId ?? null,
          snapshotId: result?.snapshotId ?? null,
          resourceLabel: result?.name ?? null,
          metadata: { itemCount: result?.itemCount ?? null },
        });
        return result;
      }),
    previewImport: systemManageProcedure
      .input(z.object({ rawJson: z.string().min(2), strategy: z.enum(["merge", "replace"]).optional() }))
      .mutation(({ input }) => previewSystemConfigSnapshotImport(input)),
    importSnapshot: systemManageProcedure
      .input(z.object({ rawJson: z.string().min(2), strategy: z.enum(["merge", "replace"]).optional(), name: z.string().optional(), description: z.string().optional(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "system.import");
        const { confirmText, ...payload } = input;
        const result = await importSystemConfigSnapshot({ ...payload, updatedBy: ctx.user.id });
        await recordAdminAudit(ctx, {
          actionType: "system.snapshot.import",
          actionLabel: "导入系统配置快照",
          resourceType: "system_snapshot",
          resourceId: result?.snapshotId ?? null,
          snapshotId: result?.snapshotId ?? null,
          metadata: { strategy: result?.strategy ?? payload.strategy ?? null, changedCount: result?.changedCount ?? null },
        });
        return result;
      }),
    downloadSnapshot: systemViewProcedure
      .input(z.object({ snapshotId: z.number() }))
      .mutation(({ input }) => getSystemConfigSnapshotDownload(input.snapshotId)),
    restoreSnapshot: systemManageProcedure
      .input(z.object({ snapshotId: z.number(), strategy: z.enum(["merge", "replace"]).optional(), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "system.restore");
        const { confirmText, ...payload } = input;
        const result = await restoreSystemConfigSnapshot({ ...payload, updatedBy: ctx.user.id });
        await recordAdminAudit(ctx, {
          actionType: "system.snapshot.restore",
          actionLabel: "恢复系统配置快照",
          resourceType: "system_snapshot",
          resourceId: input.snapshotId,
          snapshotId: input.snapshotId,
          metadata: { strategy: result?.strategy ?? payload.strategy ?? null, changedCount: result?.changedCount ?? null },
        });
        return result;
      }),
    update: systemManageProcedure
      .input(
        z.object({
          settingKey: z.string().min(1),
          value: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await upsertSystemSetting({ ...input, updatedBy: ctx.user.id });
        await recordAdminAudit(ctx, {
          actionType: "system.setting.update",
          actionLabel: "更新系统配置",
          resourceType: "system_setting",
          resourceId: input.settingKey,
          resourceLabel: input.settingKey,
        });
        return result;
      }),
    clear: systemManageProcedure
      .input(z.object({ settingKey: z.string().min(1), confirmText: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        assertDangerousConfirmation(input.confirmText, "system.clear");
        const result = await clearSystemSetting(input.settingKey, ctx.user.id);
        await recordAdminAudit(ctx, {
          actionType: "system.setting.clear",
          actionLabel: "清除系统配置覆盖",
          resourceType: "system_setting",
          resourceId: input.settingKey,
          resourceLabel: input.settingKey,
        });
        return result;
      }),
    sendTestEmail: systemManageProcedure
      .input(z.object({ to: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const result = await sendSystemTestEmail({
          to: input.to,
          adminUserId: ctx.user.id,
          adminEmail: ctx.user.email,
        });
        await recordAdminAudit(ctx, {
          actionType: "system.email.test",
          actionLabel: "发送系统测试邮件",
          resourceType: "email_test",
          resourceId: input.to,
          resourceLabel: input.to,
          metadata: { status: (result as any)?.status ?? null },
        });
        return result;
      }),
  }),

  notification: router({
    inbox: protectedProcedure
      .input(z.object({ status: z.enum(["unread", "read", "all"]).optional().default("all"), limit: z.number().min(1).max(200).optional() }).optional())
      .query(({ input, ctx }) => listUserNotifications(ctx.user.id, { status: input?.status ?? "all", limit: input?.limit })),
    unreadCount: protectedProcedure.query(({ ctx }) => getUnreadUserNotificationCount(ctx.user.id)),
    markRead: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).optional(), all: z.boolean().optional().default(false) }))
      .mutation(({ input, ctx }) => markUserNotificationsRead(ctx.user.id, input)),
    emails: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
      .query(({ input, ctx }) => listEmailDeliveriesByUser(ctx.user.id, { limit: input?.limit })),
  }),

  stats: router({
    overview: dashboardViewProcedure.query(() => getStats()),
  }),

  ai: router({
    chat: publicProcedure
      .input(
        z.object({
          messages: z.array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const coursesData = await getCourses({ status: "published", limit: 50 });
        const courseContext = coursesData.items
          .slice(0, 20)
          .map((c) => `- ${c.title}（${c.category?.name ?? "未分类"}）：${c.description ?? ""}`)
          .join("\n");
        const systemPrompt = `你是 LearnFlow 在线学习平台的 AI 助手，专注于帮助用户找到合适的课程和学习路径。
当前平台课程列表：
${courseContext}
请根据用户的问题，提供专业、友好的学习建议，并推荐合适的课程。回答要简洁清晰，使用中文。`;
        const response = await invokeLLM({
          messages: [{ role: "system", content: systemPrompt }, ...input.messages],
        });
        const rawReply = response.choices[0]?.message?.content;
        return {
          content: typeof rawReply === "string" ? rawReply : "抱歉，无法生成回答。",
        };
      }),
    searchCourses: publicProcedure
      .input(z.object({ query: z.string() }))
      .mutation(async ({ input }) => {
        const keywordRes = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "从用户的查询中提取 2-4 个关键词用于搜索课程，只返回关键词，用空格分隔，不要其他内容。",
            },
            { role: "user", content: input.query },
          ],
        });
        const rawContent = keywordRes.choices[0]?.message?.content;
        const keywords = typeof rawContent === "string" ? rawContent.trim() : input.query;
        return searchCoursesByText(keywords);
      }),
  }),
});

export type AppRouter = typeof appRouter;
