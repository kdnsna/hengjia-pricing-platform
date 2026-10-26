import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, or } from "drizzle-orm";
import { appUsers } from "@db/schema";
import { ROLE_IDS, type AccountStatus } from "@contracts/access";
import { authedQuery, createRouter, permittedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { createSession, hashPassword, makeSessionCookie, revokeSession, revokeUserSessions, toAccessUser, verifyLogin } from "./access";
import { recordAudit } from "./audit";

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW = 15 * 60 * 1000;

function checkLoginAttempts(username: string) {
  const current = attempts.get(username);
  if (current && current.resetAt > Date.now() && current.count >= 5) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "登录尝试次数过多，请15分钟后再试" });
  }
  if (current && current.resetAt <= Date.now()) attempts.delete(username);
}

function recordLoginFailure(username: string) {
  const current = attempts.get(username);
  if (!current || current.resetAt <= Date.now()) attempts.set(username, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW });
  else current.count += 1;
}

const passwordSchema = z.string().min(10).max(128)
  .regex(/[a-z]/, "密码须包含小写字母")
  .regex(/[A-Z]/, "密码须包含大写字母")
  .regex(/[0-9]/, "密码须包含数字");

export const authRouter = createRouter({
  me: publicQuery.query(({ ctx }) => ctx.user ?? null),

  login: publicQuery.input(z.object({
    username: z.string().trim().toLowerCase().min(3).max(64),
    password: z.string().min(1).max(128),
  })).mutation(async ({ ctx, input }) => {
    checkLoginAttempts(input.username);
    const result = await verifyLogin(input.username, input.password);
    if (!result.user) {
      recordLoginFailure(input.username);
      throw new TRPCError({ code: "UNAUTHORIZED", message: result.disabled ? "账号已停用，请联系计价管理员" : "账号或密码不正确" });
    }
    attempts.delete(input.username);
    const token = await createSession(result.user.id);
    ctx.resHeaders.append("set-cookie", makeSessionCookie(ctx.req.headers, token));
    await recordAudit(result.user, "账号登录", "用户账号", String(result.user.id), `${result.user.username} 登录计价工作台`);
    return result.user;
  }),

  logout: authedQuery.mutation(async ({ ctx }) => {
    await recordAudit(ctx.user, "退出登录", "用户账号", String(ctx.user.id), `${ctx.user.username} 退出计价工作台`);
    await revokeSession(ctx.req.headers);
    ctx.resHeaders.append("set-cookie", makeSessionCookie(ctx.req.headers, "", true));
    return { ok: true };
  }),

  listUsers: permittedQuery("accounts:manage").query(async () => {
    const rows = await getDb().select().from(appUsers).orderBy(appUsers.id);
    return rows.map((row) => ({
      ...toAccessUser(row),
      status: row.status as AccountStatus,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
    }));
  }),

  createUser: permittedQuery("accounts:manage").input(z.object({
    username: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,31}$/, "账号为3—32位小写字母、数字或._-"),
    employeeId: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/, "请输入有效的员工编号"),
    name: z.string().trim().min(2).max(64),
    role: z.enum(ROLE_IDS),
    branch: z.string().trim().min(2).max(80),
    position: z.string().trim().min(2).max(64),
    password: passwordSchema,
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const duplicate = await db.select({ id: appUsers.id }).from(appUsers).where(or(
      eq(appUsers.username, input.username),
      eq(appUsers.employeeId, input.employeeId),
    )).limit(1);
    if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: "登录账号或员工编号已存在" });
    const [{ id }] = await db.insert(appUsers).values({
      username: input.username,
      employeeId: input.employeeId,
      name: input.name,
      role: input.role,
      branch: input.branch,
      position: input.position,
      passwordHash: hashPassword(input.password),
      status: "active",
    }).$returningId();
    await recordAudit(ctx.user, "新增账号", "用户账号", String(id), `${input.name}（${input.username}），角色 ${input.role}，机构 ${input.branch}；未记录密码`);
    return { ok: true, id };
  }),

  updateUser: permittedQuery("accounts:manage").input(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(2).max(64),
    role: z.enum(ROLE_IDS),
    branch: z.string().trim().min(2).max(80),
    position: z.string().trim().min(2).max(64),
    status: z.enum(["active", "disabled"]),
  })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "不能修改当前登录账号的角色、机构或状态，请由其他管理员办理" });
    const db = getDb();
    const current = await db.query.appUsers.findFirst({ where: eq(appUsers.id, input.id) });
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "账号不存在" });
    await db.update(appUsers).set({
      name: input.name,
      role: input.role,
      branch: input.branch,
      position: input.position,
      status: input.status,
      updatedAt: new Date(),
    }).where(eq(appUsers.id, input.id));
    await revokeUserSessions(input.id);
    await recordAudit(ctx.user, "调整账号权限", "用户账号", String(input.id), `${current.username}：角色 ${current.role}→${input.role}，机构 ${current.branch}→${input.branch}，状态 ${current.status}→${input.status}；原会话已注销`);
    return { ok: true };
  }),
});
