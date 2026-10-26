import assert from "node:assert/strict";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import { DEMO_ACCOUNT_PASSWORD, type AccessUser } from "../../contracts/access";
import { getDb } from "../../api/queries/connection";
import { allocations, auditLogs, batches, pricingRules } from "../../db/schema";

const origin = process.env.VERIFY_ORIGIN ?? "http://localhost:3000";
const command = `VERIFY_ORIGIN=${origin} node_modules/.bin/tsx verifier/v5/verify-workflow.ts`;
const logPath = "verifier/runs/v5-workflow.log";
const resultPath = "verifier/runs/v5-workflow-result.json";
const startedAt = new Date().toISOString();
const runId = Date.now().toString(36);
const ruleId = `V5${runId.toUpperCase()}`;
const period = "2026-12";
const checks: string[] = [];
const sessions: Session[] = [];
let batchId: number | undefined;
let allocationIds: number[] = [];
let exitCode = 0;
let summary: Record<string, unknown> = { status: "running", checks };

function makeClient(cookie = "") {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${origin}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })],
  });
}

type Client = ReturnType<typeof makeClient>;
type Session = { client: Client; user: AccessUser; cookie: string };

async function login(username: string): Promise<Session> {
  let setCookie = "";
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({
      url: `${origin}/api/trpc`,
      transformer: superjson,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        setCookie = response.headers.get("set-cookie") ?? "";
        return response;
      },
    })],
  });
  const user = await client.auth.login.mutate({ username, password: DEMO_ACCOUNT_PASSWORD });
  assert.match(setCookie, /^hengjia_session=/);
  const session = { client: makeClient(setCookie.split(";")[0]), user, cookie: setCookie.split(";")[0] };
  sessions.push(session);
  return session;
}

async function expectReject(action: () => Promise<unknown>, code: string, pattern: RegExp | undefined, label: string) {
  try {
    await action();
  } catch (error) {
    const typed = error as Error & { data?: { code?: string } };
    assert.equal(typed.data?.code, code, `${label} 错误码不符：${typed.message}`);
    if (pattern) assert.match(typed.message, pattern, `${label} 错误说明不符`);
    return typed.message;
  }
  throw new Error(`${label} 未被服务端阻断`);
}

function pass(label: string) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

function finish(result: Record<string, unknown>, code: number) {
  const value = { ...result, baseUrl: `${origin}/api/trpc` };
  fs.writeFileSync(resultPath, JSON.stringify(value, null, 2));
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(value)}\nexit=${code}\n`);
}

try {
  const db = getDb();
  await db.insert(pricingRules).values({
    id: ruleId,
    name: "V5办理闭环验收指标",
    category: "客户",
    groupName: "V5独立验收",
    unit: "元/户",
    stockRate: null,
    positiveRate: 25,
    negativeRate: 15,
    method: "direct",
    status: "active",
    version: 1,
  });
  const [admin, branch, reviewer, employee, manager] = await Promise.all([
    login("admin"), login("branch"), login("reviewer"), login("employee"), login("manager"),
  ]);
  await branch.client.pricing.workspace.query();
  pass("独立测试指标已建立，五类办理账号通过真实会话接入");

  const input = { month: 12, directValue: 128, opening: 8600, current: 9320, previous: 9150, cap: null, floor: null };
  const saved = await branch.client.pricing.saveBatch.mutate({
    period,
    title: `${period} V5批次明细与退回验收 ${runId}`,
    totalScore: 3200,
    employeeCount: 1,
    snapshot: [{
      employee: "伪造姓名",
      employeeId: manager.user.employeeId,
      ruleId,
      ruleName: "伪造指标名",
      ruleVersion: 1,
      ruleDefinition: null,
      input,
      score: 3200,
      expression: "浏览器占位表达式",
    }],
  });
  batchId = saved.id;
  await branch.client.pricing.submitBatch.mutate({ id: batchId });
  const reviewWorkspace = await reviewer.client.pricing.workspace.query();
  const reviewBatch = reviewWorkspace.batches.find((batch) => batch.id === batchId);
  assert.ok(reviewBatch);
  const snapshot = reviewBatch.resultSnapshot as Array<Record<string, unknown>>;
  assert.equal(snapshot[0]?.employee, manager.user.name);
  assert.equal(snapshot[0]?.ruleName, "V5办理闭环验收指标");
  assert.equal(snapshot[0]?.ruleVersion, 1);
  assert.equal(snapshot[0]?.score, 3200);
  assert.notEqual(snapshot[0]?.expression, "浏览器占位表达式");
  assert.ok((reviewWorkspace.batches ?? []).every((batch) => batch.ownerBranch === "城东支行" || reviewer.user.scope === "all"));
  pass("服务端复算明细、人员名称、指标名称和规则版本在复核工作区完整可读");

  await expectReject(() => reviewer.client.pricing.returnBatch.mutate({ id: batchId!, reason: "短" }), "BAD_REQUEST", undefined, "过短退回原因");
  await expectReject(() => branch.client.pricing.returnBatch.mutate({ id: batchId!, reason: "越权退回测试" }), "FORBIDDEN", /没有此项操作权限/, "提交机构退回批次");
  await reviewer.client.pricing.returnBatch.mutate({ id: batchId, reason: "V5验收：请核对人员与业务输入后重新提交" });
  const returned = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
  assert.equal(returned?.status, "draft");
  assert.equal(returned?.returnedBy, reviewer.user.id);
  assert.equal(returned?.returnedByName, reviewer.user.name);
  assert.match(returned?.returnReason ?? "", /人员与业务输入/);
  assert.ok(returned?.returnedAt);
  assert.equal(returned?.submittedBy, null);
  await expectReject(() => reviewer.client.pricing.returnBatch.mutate({ id: batchId!, reason: "重复退回应被拒绝" }), "CONFLICT", /只有复核中的批次/, "重复退回");
  pass("复核退回答复原因、人员和时间，越权及重复退回被拦截");

  const updatePayload = {
    id: batchId,
    title: `${period} V5批次明细与退回验收 ${runId}（已修改）`,
    snapshot: [{
      employee: manager.user.name,
      employeeId: manager.user.employeeId,
      ruleId,
      ruleName: "V5办理闭环验收指标",
      ruleVersion: 1,
      ruleDefinition: null,
      input: { ...input, directValue: 256 },
      score: 1,
      expression: "客户端旧结果，服务端必须重算",
    }],
  };
  await expectReject(() => reviewer.client.pricing.updateBatch.mutate(updatePayload), "FORBIDDEN", /没有此项操作权限/, "复核人员修改草稿");
  const updated = await branch.client.pricing.updateBatch.mutate(updatePayload);
  assert.equal(updated.totalScore, 6400);
  assert.equal(updated.employeeCount, 1);
  const updatedBatch = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
  const updatedSnapshot = updatedBatch?.resultSnapshot as Array<Record<string, unknown>>;
  assert.equal(updatedBatch?.totalScore, 6400);
  assert.equal(updatedSnapshot[0]?.score, 6400);
  assert.notEqual(updatedSnapshot[0]?.expression, "客户端旧结果，服务端必须重算");
  pass("退回草稿可编辑业务输入，服务端重算积分、人数和快照且越权修改被拦截");

  await branch.client.pricing.submitBatch.mutate({ id: batchId });
  await reviewer.client.pricing.approveBatch.mutate({ id: batchId });
  const locked = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
  assert.equal(locked?.status, "locked");
  assert.equal(locked?.totalScore, 6400);
  assert.equal(locked?.approvedBy, reviewer.user.id);
  assert.match(locked?.returnReason ?? "", /人员与业务输入/);
  await expectReject(() => branch.client.pricing.updateBatch.mutate(updatePayload), "CONFLICT", /只有草稿批次可以修改/, "锁定后修改");
  await expectReject(() => reviewer.client.pricing.returnBatch.mutate({ id: batchId!, reason: "锁定后退回应被拒绝" }), "CONFLICT", /只有复核中的批次/, "锁定后退回");
  await expectReject(() => reviewer.client.pricing.approveBatch.mutate({ id: batchId! }), "CONFLICT", /只有复核中的批次/, "重复审批");
  const batchLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.objectType, "计价批次"), eq(auditLogs.objectId, String(batchId))));
  assert.ok(batchLogs.some((log) => log.action === "修改批次"));
  assert.ok(batchLogs.some((log) => log.action === "退回批次"));
  assert.ok(batchLogs.filter((log) => log.action === "提交复核").length >= 2);
  assert.ok(batchLogs.some((log) => log.action === "审批锁定"));
  pass("修改后重新提交、独立审批和锁定形成闭环，历史原因及每次办理日志保留");

  const allocationBase = { ruleId, period, reason: "V5验收：本人参与的本机构协同分润" };
  await manager.client.pricing.createAllocation.mutate({ ...allocationBase, employeeId: manager.user.employeeId, employeeName: manager.user.name, branch: manager.user.branch, ratio: 60 });
  await manager.client.pricing.createAllocation.mutate({ ...allocationBase, employeeId: employee.user.employeeId, employeeName: "伪造员工姓名", branch: "伪造机构", ratio: 40 });
  const createdShares = await db.select().from(allocations).where(and(eq(allocations.ruleId, ruleId), eq(allocations.period, period)));
  assert.equal(createdShares.length, 2);
  allocationIds = createdShares.map((share) => share.id);
  const managerShare = createdShares.find((share) => share.employeeId === manager.user.employeeId)!;
  const employeeShare = createdShares.find((share) => share.employeeId === employee.user.employeeId)!;
  assert.equal(employeeShare.employeeName, employee.user.name);
  assert.equal(employeeShare.branch, employee.user.branch);
  await expectReject(() => manager.client.pricing.confirmAllocation.mutate({ id: employeeShare.id }), "FORBIDDEN", /只能确认本人/, "客户经理代员工确认");
  await expectReject(() => admin.client.pricing.confirmAllocation.mutate({ id: employeeShare.id }), "FORBIDDEN", /只能确认本人/, "管理员代员工确认");
  await employee.client.pricing.confirmAllocation.mutate({ id: employeeShare.id });
  await expectReject(() => employee.client.pricing.confirmAllocation.mutate({ id: employeeShare.id }), "CONFLICT", /已确认/, "员工重复确认");
  await expectReject(() => employee.client.pricing.confirmAllocation.mutate({ id: managerShare.id }), "FORBIDDEN", /只能确认本人/, "员工代客户经理确认");
  await manager.client.pricing.confirmAllocation.mutate({ id: managerShare.id });
  const confirmedShares = await db.select().from(allocations).where(and(eq(allocations.ruleId, ruleId), eq(allocations.period, period)));
  assert.ok(confirmedShares.every((share) => share.status === "approved" && share.confirmedAt && share.confirmedBy));
  assert.equal(confirmedShares.find((share) => share.id === employeeShare.id)?.confirmedBy, employee.user.id);
  assert.equal(confirmedShares.find((share) => share.id === managerShare.id)?.confirmedBy, manager.user.id);
  const shareLogs = await db.select().from(auditLogs).where(eq(auditLogs.objectType, "业绩分润"));
  const currentShareLogs = shareLogs.filter((log) => allocationIds.includes(Number(log.objectId)) && log.action === "确认分润");
  assert.equal(currentShareLogs.length, 2);
  pass("两名归属人分别确认本人分润，代确认和重复确认被拦截且仅写两条确认日志");

  summary = {
    status: "pass",
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
    checkCount: checks.length,
    testArtifacts: { ruleId, batchId, allocationIds, retained: true },
  };
} catch (error) {
  exitCode = 1;
  summary = {
    status: "fail",
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
    checkCount: checks.length,
    error: error instanceof Error ? error.stack : String(error),
    testArtifacts: { ruleId, batchId, allocationIds },
  };
} finally {
  const cleanup: string[] = [];
  const cleanupErrors: string[] = [];
  try {
    const db = getDb();
    const testRule = await db.query.pricingRules.findFirst({ where: eq(pricingRules.id, ruleId) });
    if (testRule && testRule.status !== "disabled") {
      await db.update(pricingRules).set({ status: "disabled", version: testRule.version + 1, updatedAt: new Date() }).where(eq(pricingRules.id, ruleId));
    }
    cleanup.push("独立测试指标已停用，测试批次、分润和审计记录保留");
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error.stack : String(error));
  }
  const logoutResults = await Promise.allSettled(sessions.map((session) => session.client.auth.logout.mutate()));
  if (logoutResults.some((result) => result.status === "rejected")) cleanupErrors.push("部分验收会话未能正常退出");
  summary = { ...summary, cleanup, cleanupErrors };
  if (cleanupErrors.length && exitCode === 0) {
    exitCode = 1;
    summary.status = "fail";
    summary.error = `验收后清理失败：${cleanupErrors.join("；")}`;
  }
  finish(summary, exitCode);
  try {
    const client = (getDb() as unknown as { $client?: { end?: () => Promise<void> } }).$client;
    await client?.end?.();
  } catch {
    // 验收结果已落盘，连接池关闭失败不掩盖业务结果。
  }
  console.log(JSON.stringify(summary));
  process.exitCode = exitCode;
}
