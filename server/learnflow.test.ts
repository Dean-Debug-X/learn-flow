import { describe, expect, it } from "vitest";
import { appRouter } from "./routers.js";
import { COOKIE_NAME } from "../shared/const.js";
import type { TrpcContext } from "./_core/context.js";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@learnflow.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createUserContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@learnflow.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return { ctx };
}

function createGuestContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return { ctx };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("returns null for unauthenticated user", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user info for authenticated user", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Admin User");
    expect(result?.role).toBe("admin");
  });

  it("returns the login method availability map", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.availableMethods();

    expect(result).toHaveProperty("wechat");
    expect(result).toHaveProperty("phone");
    expect(result).toHaveProperty("email");
    expect(result).toHaveProperty("legacyOAuth");
  });

  it("returns bound identities for authenticated user", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.identities();

    expect(Array.isArray(result)).toBe(true);
  });

  it("clears session cookie on logout", async () => {
    const { ctx, clearedCookies } = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

// ─── Category ─────────────────────────────────────────────────────────────────

describe("category", () => {
  it("allows public access to category list", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.category.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("blocks non-admin from creating category", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.category.create({ name: "Test", slug: "test" })
    ).rejects.toThrow();
  });
});

// ─── Course ───────────────────────────────────────────────────────────────────

describe("course", () => {
  it("allows public access to course list", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.course.list({ status: "published" });
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("blocks non-admin from creating course", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.course.create({ title: "Test", slug: "test" })
    ).rejects.toThrow();
  });

  it("blocks guest from accessing admin course list", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.course.getById({ id: 1 })).rejects.toThrow();
  });
});

// ─── Comment ──────────────────────────────────────────────────────────────────

describe("comment", () => {
  it("allows public access to comments by course", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.comment.listByCourse({ courseId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("blocks unauthenticated users from creating comments", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.comment.create({ courseId: 1, content: "Great course!", rating: 5 })
    ).rejects.toThrow();
  });

  it("blocks non-admin from deleting comments", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.comment.delete({ id: 1 })).rejects.toThrow();
  });

  it("blocks non-admin from listing all comments", async () => {
    const { ctx } = createUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.comment.adminList()).rejects.toThrow();
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe("stats", () => {
  it("blocks non-admin from accessing stats", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.stats.overview()).rejects.toThrow();
  });
});

// ─── AI ───────────────────────────────────────────────────────────────────────

describe("ai", () => {
  it("validates chat input schema", async () => {
    const { ctx } = createGuestContext();
    const caller = appRouter.createCaller(ctx);
    // Should throw on invalid role
    await expect(
      caller.ai.chat({
        messages: [{ role: "invalid" as "user", content: "hello" }],
      })
    ).rejects.toThrow();
  });
});
