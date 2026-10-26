import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { appUsers, authSessions } from "@db/schema";
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD, ROLE_DEFINITIONS, isRoleId, permissionsForRole, type AccessUser } from "@contracts/access";
import { getDb } from "./queries/connection";

export const SESSION_COOKIE = "hengjia_session";
export const SESSION_SECONDS = 8 * 60 * 60;
const SESSION_MS = SESSION_SECONDS * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = stored.split("$");
    if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookies(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

export function sessionToken(headers: Headers): string | null {
  return cookies(headers)[SESSION_COOKIE] ?? null;
}

function isLocalRequest(headers: Headers): boolean {
  const host = headers.get("host") ?? "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function makeSessionCookie(headers: Headers, token: string, clear = false): string {
  const parts = [
    `${SESSION_COOKIE}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${clear ? 0 : SESSION_SECONDS}`,
  ];
  if (!isLocalRequest(headers)) parts.push("Secure");
  return parts.join("; ");
}

export async function ensureAuthSeed(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ username: appUsers.username }).from(appUsers);
  const usernames = new Set(existing.map((row) => row.username));
  const missing = DEMO_ACCOUNTS.filter((account) => !usernames.has(account.username));
  if (!missing.length) return;
  await db.insert(appUsers).values(missing.map((account) => ({
    ...account,
    passwordHash: hashPassword(DEMO_ACCOUNT_PASSWORD),
    status: "active",
  }))).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
}

export function toAccessUser(row: {
  id: number;
  username: string;
  employeeId: string;
  name: string;
  role: string;
  branch: string;
  position: string;
}): AccessUser {
  if (!isRoleId(row.role)) throw new Error("账号角色配置无效");
  return {
    id: row.id,
    username: row.username,
    employeeId: row.employeeId,
    name: row.name,
    role: row.role,
    branch: row.branch,
    position: row.position,
    scope: ROLE_DEFINITIONS[row.role].scope,
    permissions: permissionsForRole(row.role),
  };
}

export async function authenticateUser(headers: Headers): Promise<AccessUser | null> {
  const token = sessionToken(headers);
  if (!token) return null;
  const digest = tokenDigest(token);
  const rows = await getDb().select({
    id: appUsers.id,
    username: appUsers.username,
    employeeId: appUsers.employeeId,
    name: appUsers.name,
    role: appUsers.role,
    branch: appUsers.branch,
    position: appUsers.position,
    status: appUsers.status,
  }).from(authSessions).innerJoin(appUsers, eq(authSessions.userId, appUsers.id)).where(and(
    eq(authSessions.tokenHash, digest),
    gt(authSessions.expiresAt, new Date()),
  )).limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  return toAccessUser(row);
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb().delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  await getDb().insert(authSessions).values({
    tokenHash: tokenDigest(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  return token;
}

export async function revokeSession(headers: Headers): Promise<void> {
  const token = sessionToken(headers);
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, tokenDigest(token)));
}

export async function revokeUserSessions(userId: number): Promise<void> {
  await getDb().delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function verifyLogin(username: string, password: string) {
  await ensureAuthSeed();
  const row = await getDb().query.appUsers.findFirst({ where: eq(appUsers.username, username.toLowerCase()) });
  if (!row || !verifyPassword(password, row.passwordHash)) return { user: null, disabled: false };
  if (row.status !== "active") return { user: null, disabled: true };
  await getDb().update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, row.id));
  return { user: toAccessUser(row), disabled: false };
}
