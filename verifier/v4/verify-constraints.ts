import assert from "node:assert/strict";
import fs from "node:fs";
import { getDb } from "../../api/queries/connection";
import { allocations, appUsers, auditLogs, authSessions, batches, indicatorDesigns, pricingRules } from "../../db/schema";

const command = "node_modules/.bin/tsx verifier/v4/verify-constraints.ts";
const startedAt = new Date().toISOString();
const rollbackMarker = "V4_INTENTIONAL_ROLLBACK_AFTER_UNENFORCED_DUPLICATE";
const checks: string[] = [];
let exitCode = 0;
let result: Record<string, unknown>;

async function expectDuplicate(label: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && error.message === rollbackMarker) {
      throw new Error(`${label} 未拒绝重复值；测试记录已随事务回滚`);
    }
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    assert.equal(code, "ER_DUP_ENTRY", `${label} 应返回重复键错误`);
    checks.push(label);
    console.log(`PASS ${label}`);
    return;
  }
  throw new Error(`${label} 测试事务未按预期结束`);
}

try {
  const db = getDb();
  const [user] = await db.select().from(appUsers).limit(1);
  const [session] = await db.select().from(authSessions).limit(1);
  const [rule] = await db.select().from(pricingRules).limit(1);
  const [design] = await db.select().from(indicatorDesigns).limit(1);
  const [share] = await db.select().from(allocations).limit(1);
  const [batch] = await db.select().from(batches).limit(1);
  const [log] = await db.select().from(auditLogs).limit(1);
  assert.ok(user && session && rule && design && share && batch && log, "约束测试需要既有记录作为参照");
  const before = {
    users: (await db.select({ id: appUsers.id }).from(appUsers)).length,
    sessions: (await db.select({ id: authSessions.id }).from(authSessions)).length,
    rules: (await db.select({ id: pricingRules.id }).from(pricingRules)).length,
    designs: (await db.select({ id: indicatorDesigns.id }).from(indicatorDesigns)).length,
    allocations: (await db.select({ id: allocations.id }).from(allocations)).length,
    batches: (await db.select({ id: batches.id }).from(batches)).length,
    logs: (await db.select({ id: auditLogs.id }).from(auditLogs)).length,
  };

  await expectDuplicate("pricing_rules.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(pricingRules).values(rule);
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("app_users.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(appUsers).values({ ...user, username: "v4-pk-check", employeeId: "V4PKCHECK" });
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("auth_sessions.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(authSessions).values({ ...session, tokenHash: "a".repeat(64) });
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("indicator_designs.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(indicatorDesigns).values(design);
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("allocations.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(allocations).values(share);
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("calculation_batches.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(batches).values(batch);
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("audit_logs.id 主键拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values(log);
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("app_users.username 唯一约束拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(appUsers).values({ ...user, id: undefined, employeeId: "V4USERCHECK" });
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("app_users.employee_id 唯一约束拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(appUsers).values({ ...user, id: undefined, username: "v4-employee-check" });
      throw new Error(rollbackMarker);
    });
  });
  await expectDuplicate("auth_sessions.token_hash 唯一约束拒绝重复", async () => {
    await db.transaction(async (tx) => {
      await tx.insert(authSessions).values({ ...session, id: undefined });
      throw new Error(rollbackMarker);
    });
  });

  const after = {
    users: (await db.select({ id: appUsers.id }).from(appUsers)).length,
    sessions: (await db.select({ id: authSessions.id }).from(authSessions)).length,
    rules: (await db.select({ id: pricingRules.id }).from(pricingRules)).length,
    designs: (await db.select({ id: indicatorDesigns.id }).from(indicatorDesigns)).length,
    allocations: (await db.select({ id: allocations.id }).from(allocations)).length,
    batches: (await db.select({ id: batches.id }).from(batches)).length,
    logs: (await db.select({ id: auditLogs.id }).from(auditLogs)).length,
  };
  assert.deepEqual(after, before, "约束测试不得留下任何测试行或改变既有行数");
  result = { status: "pass", startedAt, finishedAt: new Date().toISOString(), checks, checkCount: checks.length, rowCountsBefore: before, rowCountsAfter: after, transactionsRolledBack: true };
} catch (error) {
  exitCode = 1;
  result = { status: "fail", startedAt, finishedAt: new Date().toISOString(), checks, error: error instanceof Error ? error.stack : String(error) };
} finally {
  fs.writeFileSync("verifier/runs/v4-constraints-result.json", JSON.stringify(result, null, 2));
  fs.appendFileSync("verifier/runs/v4-constraints.log", `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(result)}\nexit=${exitCode}\n`);
  console.log(JSON.stringify(result));
  const client = (getDb() as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
  process.exitCode = exitCode;
}
