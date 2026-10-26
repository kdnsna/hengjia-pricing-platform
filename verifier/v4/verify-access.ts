import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { and, eq, inArray } from "drizzle-orm";
import type { AppRouter } from "../../api/router";
import { DEMO_ACCOUNTS, ROLE_DEFINITIONS, type AccessUser } from "../../contracts/access";
import { calculate, type CalcInput, type IndicatorDefinition } from "../../contracts/pricing";
import { definitionToRule, emptyIndicator, formulaForMethod } from "../../contracts/indicator";
import { getDb } from "../../api/queries/connection";
import { allocations, appUsers, authSessions, batches, indicatorDesigns, pricingRules } from "../../db/schema";
import { hashPassword, makeSessionCookie, verifyPassword } from "../../api/access";

const origin = process.env.VERIFY_ORIGIN ?? "http://localhost:3000";
const command = `VERIFY_ORIGIN=${origin} node_modules/.bin/tsx verifier/v4/verify-access.ts`;
const logPath = "verifier/runs/v4-access.log";
const resultPath = "verifier/runs/v4-access-result.json";
const startedAt = new Date().toISOString();
const baseUrl = `${origin}/api/trpc`;
const password = "Hengjia@2026";
const testPassword = "V4test@2026A";
const runId = Date.now().toString(36);
const idSuffix = runId.toUpperCase();
const ruleId = `V${idSuffix}`;
const period = "2026-12";
const checks: string[] = [];
const createdUsers: Array<{ id: number; username: string }> = [];
let admin: Session | undefined;
let designId: number | undefined;
let rulePublished = false;
let ruleDisabled = false;
let designPublished = false;

function makeClient(cookie = "") {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({
      url: baseUrl,
      transformer: superjson,
      headers: cookie ? { cookie } : {},
    })],
  });
}

type Client = ReturnType<typeof makeClient>;
type Session = { client: Client; user: AccessUser; cookie: string; setCookie: string };

async function login(username: string, secret = password): Promise<Session> {
  let setCookie = "";
  const loginClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({
      url: baseUrl,
      transformer: superjson,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        setCookie = response.headers.get("set-cookie") ?? "";
        return response;
      },
    })],
  });
  const user = await loginClient.auth.login.mutate({ username, password: secret });
  assert.match(setCookie, /^hengjia_session=/, `${username} 登录未写入会话 Cookie`);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=28800/);
  assert.doesNotMatch(setCookie, /Secure/, "localhost 演示会话不应错误要求 Secure");
  return { client: makeClient(setCookie.split(";")[0]), user, cookie: setCookie.split(";")[0], setCookie };
}

async function rawRpc(path: string, options: { input?: unknown; cookie?: string; mutation?: boolean } = {}) {
  const url = new URL(`${baseUrl}/${path}`);
  if (!options.mutation && options.input !== undefined) url.searchParams.set("input", JSON.stringify({ json: options.input }));
  const response = await fetch(url, {
    method: options.mutation ? "POST" : "GET",
    headers: {
      ...(options.mutation ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.mutation ? JSON.stringify({ json: options.input }) : undefined,
  });
  const body = await response.json() as {
    result?: { data?: { json?: unknown } };
    error?: { json?: { message?: string; data?: { code?: string } } };
  };
  return {
    status: response.status,
    code: body.error?.json?.data?.code,
    message: body.error?.json?.message,
    data: body.result?.data?.json,
  };
}

async function expectReject(
  action: () => Promise<unknown>,
  code: string,
  pattern: RegExp | undefined,
  label: string,
) {
  try {
    await action();
  } catch (error) {
    const typed = error as Error & { data?: { code?: string } };
    assert.equal(typed.data?.code, code, `${label} 权限或错误码不符：${typed.message}`);
    if (pattern) assert.match(typed.message, pattern, `${label} 错误说明不符`);
    return typed.message;
  }
  throw new Error(`${label} 未被服务端阻断`);
}

function pass(label: string) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

function makeDefinition(id: string): IndicatorDefinition {
  const definition = emptyIndicator(id);
  Object.assign(definition, {
    name: "V4权限与流程验收指标",
    category: "客户",
    group: "V4验收演练",
    unit: "元/户",
    department: "个人金融业务部",
    owner: "计价管理员",
    description: "仅用于V4登录权限、指标复核、分润和批次验收，不属于年度权威计价指标。",
    sourceCode: "M9400001",
    metricCode: "M9400002",
    sourceUnit: "户",
    unitFactor: 1,
    method: "direct",
    stockRate: null,
    positiveRate: 25,
    negativeRate: 15,
  });
  definition.formula = formulaForMethod("direct");
  definition.assessment.description = "仅用于V4验收；提交、独立复测、发布和批次复算均须保留记录。";
  return definition;
}

function batchInput(person: { id: string; name: string }, rule: { id: string; name: string; version: number }, score: number): {
  period: string;
  title: string;
  totalScore: number;
  employeeCount: number;
  snapshot: Array<Record<string, unknown>>;
} {
  const input: CalcInput = { month: 12, directValue: 128, opening: 8600, current: 9320, previous: 9150, cap: null, floor: null };
  return {
    period,
    title: `${period} V4权限验收批次 ${runId}`,
    totalScore: score,
    employeeCount: 1,
    snapshot: [{
      employee: person.name,
      employeeId: person.id,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleVersion: rule.version,
      ruleDefinition: null,
      input,
      score,
      expression: "浏览器占位表达式，服务端必须重算",
    }],
  };
}

async function createTestAccount(session: Session, username: string, employeeId: string, name: string, role: keyof typeof ROLE_DEFINITIONS, branch: string) {
  const result = await session.client.auth.createUser.mutate({
    username,
    employeeId,
    name,
    role,
    branch,
    position: ROLE_DEFINITIONS[role].label,
    password: testPassword,
  });
  createdUsers.push({ id: result.id, username });
  return result;
}

async function finish(result: Record<string, unknown>, exitCode: number) {
  const value = { ...result, baseUrl };
  fs.writeFileSync(resultPath, JSON.stringify(value, null, 2));
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(value)}\nexit=${exitCode}\n`);
}

let exitCode = 0;
let summary: Record<string, unknown> = { status: "running", checks };
let branchBatchId: number | undefined;
let separationBatchId: number | undefined;

try {
  const anonymousMe = await rawRpc("auth.me");
  assert.equal(anonymousMe.status, 200);
  assert.equal(anonymousMe.data, null);
  const anonymousWorkspace = await rawRpc("pricing.workspace");
  assert.equal(anonymousWorkspace.status, 401);
  assert.equal(anonymousWorkspace.code, "UNAUTHORIZED");
  const invalidSession = await rawRpc("pricing.workspace", { cookie: "hengjia_session=invalid" });
  assert.equal(invalidSession.status, 401);
  assert.equal(invalidSession.code, "UNAUTHORIZED");
  pass("未登录及无效会话访问业务接口均被拒绝");

  const wrongPassword = await rawRpc("auth.login", { mutation: true, input: { username: "employee", password: "wrong-password" } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.code, "UNAUTHORIZED");
  assert.match(wrongPassword.message ?? "", /账号或密码不正确/);
  const firstHash = hashPassword(testPassword);
  const secondHash = hashPassword(testPassword);
  assert.notEqual(firstHash, secondHash, "同一密码应使用不同随机盐");
  assert.equal(verifyPassword(testPassword, firstHash), true);
  assert.equal(verifyPassword("wrong", firstHash), false);
  assert.match(makeSessionCookie(new Headers({ host: "bank.example" }), "token"), /Secure/);
  pass("密码随机盐、校验和非本地 Cookie Secure 属性正确");

  const sessions = new Map<string, Session>();
  for (const account of DEMO_ACCOUNTS) {
    const session = await login(account.username);
    assert.equal(session.user.role, account.role);
    assert.equal(session.user.branch, account.branch);
    assert.equal(session.user.scope, ROLE_DEFINITIONS[account.role].scope);
    assert.deepEqual(session.user.permissions, ROLE_DEFINITIONS[account.role].permissions);
    const me = await session.client.auth.me.query();
    assert.equal(me?.id, session.user.id);
    sessions.set(account.username, session);
  }
  pass("六类演示账号登录、角色、机构、数据范围和会话读取一致");

  const employee = sessions.get("employee")!;
  const manager = sessions.get("manager")!;
  const branch = sessions.get("branch")!;
  const leader = sessions.get("leader")!;
  const reviewer = sessions.get("reviewer")!;
  admin = sessions.get("admin")!;
  const [employeeWorkspace, managerWorkspace, branchWorkspace, leaderWorkspace, reviewerWorkspace, adminWorkspace] = await Promise.all([
    employee.client.pricing.workspace.query(),
    manager.client.pricing.workspace.query(),
    branch.client.pricing.workspace.query(),
    leader.client.pricing.workspace.query(),
    reviewer.client.pricing.workspace.query(),
    admin.client.pricing.workspace.query(),
  ]);
  assert.ok(employeeWorkspace.rules.length >= 51);
  assert.ok(employeeWorkspace.rules.every((rule) => rule.status === "active"));
  assert.deepEqual(employeeWorkspace.people.map((person) => person.id), [employee.user.employeeId]);
  assert.ok(employeeWorkspace.shares.every((share) => share.employeeId === employee.user.employeeId || share.createdByEmployeeId === employee.user.employeeId));
  assert.deepEqual(employeeWorkspace.designs, []);
  assert.deepEqual(employeeWorkspace.batches, []);
  assert.deepEqual(employeeWorkspace.logs, []);
  assert.deepEqual(managerWorkspace.people.map((person) => person.id), [manager.user.employeeId]);
  assert.ok(managerWorkspace.allocationPeople.some((person) => person.id === employee.user.employeeId));
  assert.ok(managerWorkspace.allocationPeople.every((person) => person.branch === manager.user.branch));
  assert.ok(managerWorkspace.shares.every((share) => share.employeeId === manager.user.employeeId || share.createdByEmployeeId === manager.user.employeeId));
  assert.ok(branchWorkspace.people.every((person) => person.branch === branch.user.branch));
  assert.ok(branchWorkspace.shares.every((share) => share.branch === branch.user.branch));
  assert.ok(branchWorkspace.batches.every((batch) => batch.ownerBranch === branch.user.branch));
  assert.deepEqual(branchWorkspace.designs, []);
  assert.deepEqual(branchWorkspace.logs, []);
  assert.ok(leaderWorkspace.batches.length >= branchWorkspace.batches.length);
  assert.ok(leaderWorkspace.logs.length > 0);
  assert.deepEqual(leaderWorkspace.designs, []);
  assert.ok(reviewerWorkspace.designs.length >= 0);
  assert.ok(reviewerWorkspace.logs.length > 0);
  assert.ok(adminWorkspace.designs.length >= reviewerWorkspace.designs.length);
  assert.ok(adminWorkspace.logs.length > 0);
  pass("本人、本机构和全行工作区数据范围按角色实际过滤");

  const listedUsers = await admin.client.auth.listUsers.query();
  for (const account of DEMO_ACCOUNTS) assert.ok(listedUsers.some((row) => row.username === account.username && row.status === "active"));
  assert.equal("passwordHash" in listedUsers[0], false, "账号列表不得返回密码哈希");
  await expectReject(() => employee.client.auth.listUsers.query(), "FORBIDDEN", /没有此项操作权限/, "员工读取账号列表");
  await expectReject(() => branch.client.auth.listUsers.query(), "FORBIDDEN", /没有此项操作权限/, "机构负责人读取账号列表");
  await expectReject(() => reviewer.client.auth.listUsers.query(), "FORBIDDEN", /没有此项操作权限/, "复核人员读取账号列表");
  await expectReject(() => admin.client.auth.updateUser.mutate({ id: admin!.user.id, name: admin!.user.name, role: admin!.user.role, branch: admin!.user.branch, position: admin!.user.position, status: "active" }), "FORBIDDEN", /不能修改当前登录账号/, "管理员自改权限");
  pass("账号目录仅管理员可读且不泄露哈希，管理员不能自改权限");

  const rawToken = decodeURIComponent(employee.cookie.slice(employee.cookie.indexOf("=") + 1));
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const storedSessions = await getDb().select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash));
  assert.equal(storedSessions.length, 1);
  assert.equal(storedSessions[0].tokenHash, tokenHash);
  assert.notEqual(storedSessions[0].tokenHash, rawToken);
  const logoutSession = await login("employee");
  const logoutToken = decodeURIComponent(logoutSession.cookie.slice(logoutSession.cookie.indexOf("=") + 1));
  const logoutHash = createHash("sha256").update(logoutToken).digest("hex");
  await logoutSession.client.auth.logout.mutate();
  assert.equal((await rawRpc("auth.me", { cookie: logoutSession.cookie })).data, null);
  assert.equal((await getDb().select({ id: authSessions.id }).from(authSessions).where(eq(authSessions.tokenHash, logoutHash))).length, 0);
  pass("数据库只存会话哈希，退出后服务端会话删除且原 Cookie 失效");

  const expireAccount = await createTestAccount(admin, `v4exp-${runId}`, `V4E${idSuffix}`, "过期会话测试", "employee", "城东支行");
  const expireSession = await login(`v4exp-${runId}`, testPassword);
  const expireToken = decodeURIComponent(expireSession.cookie.slice(expireSession.cookie.indexOf("=") + 1));
  const expireHash = createHash("sha256").update(expireToken).digest("hex");
  await getDb().update(authSessions).set({ expiresAt: new Date(Date.now() - 60_000) }).where(and(eq(authSessions.tokenHash, expireHash), eq(authSessions.userId, expireAccount.id)));
  assert.equal((await rawRpc("auth.me", { cookie: expireSession.cookie })).data, null);
  assert.equal((await rawRpc("pricing.workspace", { cookie: expireSession.cookie })).code, "UNAUTHORIZED");
  pass("过期会话不能读取身份或业务数据");

  const lockAccount = await createTestAccount(admin, `v4lock-${runId}`, `V4L${idSuffix}`, "登录限流测试", "employee", "城东支行");
  assert.ok(lockAccount.id > 0);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const failure = await rawRpc("auth.login", { mutation: true, input: { username: `v4lock-${runId}`, password: `Wrong${attempt}A` } });
    assert.equal(failure.code, "UNAUTHORIZED");
  }
  const limited = await rawRpc("auth.login", { mutation: true, input: { username: `v4lock-${runId}`, password: testPassword } });
  assert.equal(limited.status, 429);
  assert.equal(limited.code, "TOO_MANY_REQUESTS");
  assert.match(limited.message ?? "", /15分钟/);
  pass("同一账号连续五次失败后触发登录限流");

  const definition = makeDefinition(ruleId);
  const beforeReadOnly = await admin.client.pricing.workspace.query();
  const wrongUnit = structuredClone(definition);
  wrongUnit.sourceUnit = "元";
  wrongUnit.unit = "元/万元";
  wrongUnit.unitFactor = 1;
  const wrongUnitResult = await reviewer.client.pricing.testDesign.mutate({ definition: wrongUnit });
  assert.equal(wrongUnitResult.passed, false);
  assert.match(wrongUnitResult.validation.errors.join("；"), /必须为10000/);
  const noNegative = structuredClone(definition);
  noNegative.assessment.allowNegative = false;
  noNegative.assessment.cap = -10;
  const noNegativeResult = await reviewer.client.pricing.testDesign.mutate({ definition: noNegative });
  assert.equal(noNegativeResult.passed, true);
  assert.deepEqual(noNegativeResult.results.map((item) => item.score), [0, 0, 0, 0]);
  const negativeRounding = structuredClone(definition);
  negativeRounding.formula = "ROUND(-1.005, 2)";
  const roundingResult = await reviewer.client.pricing.testDesign.mutate({ definition: negativeRounding });
  assert.equal(roundingResult.passed, true);
  assert.deepEqual(roundingResult.results.map((item) => item.score), [-1.01, -1.01, -1.01, -1.01]);
  const afterReadOnly = await admin.client.pricing.workspace.query();
  for (const key of ["rules", "designs", "batches", "logs"] as const) assert.equal(JSON.stringify(afterReadOnly[key]), JSON.stringify(beforeReadOnly[key]), `独立测试不得改写 ${key}`);
  pass("单位、禁止负积分、负数舍入边界通过，独立测试不改写业务数据");

  const removedUpdate = await rawRpc("pricing.updateRule", { mutation: true, cookie: admin.cookie, input: { id: "P001", stockRate: 1, positiveRate: null, negativeRate: null } });
  assert.equal(removedUpdate.code, "NOT_FOUND");
  pass("正式规则直接修改接口已移除");


  await expectReject(
    () => employee.client.pricing.saveDesign.mutate({ baseVersion: 0, definition }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "员工维护指标",
  );
  await expectReject(
    () => reviewer.client.pricing.saveDesign.mutate({ baseVersion: 0, definition }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "复核人员维护指标",
  );
  await expectReject(
    () => leader.client.pricing.setRuleStatus.mutate({ id: "P001", status: "disabled", reason: "越权操作测试" }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "领导停用规则",
  );
  pass("员工、复核人员和领导直接调用未授权接口均被拒绝");

  const flowAccount = await createTestAccount(
    admin,
    `v4flow-${runId}`,
    `V4F${idSuffix}`,
    "流程岗位测试",
    "pricing_admin",
    "省分行",
  );
  const flowAdmin = await login(`v4flow-${runId}`, testPassword);
  const savedDesign = await flowAdmin.client.pricing.saveDesign.mutate({ baseVersion: 0, definition });
  designId = savedDesign.id;
  assert.equal(savedDesign.status, "draft");
  await expectReject(
    () => flowAdmin.client.pricing.publishDesign.mutate({ id: designId! }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "管理员发布指标",
  );
  await flowAdmin.client.pricing.submitDesign.mutate({ id: designId });
  const submittedDesign = await getDb().query.indicatorDesigns.findFirst({ where: eq(indicatorDesigns.id, designId) });
  assert.equal(submittedDesign?.status, "review");
  assert.equal(submittedDesign?.submittedBy, flowAccount.id);
  assert.equal((submittedDesign?.testSnapshot as unknown[] | null)?.length, 4);
  assert.ok(submittedDesign?.submittedAt);
  await expectReject(
    () => flowAdmin.client.pricing.saveDesign.mutate({ designId, baseVersion: 0, definition }),
    "CONFLICT",
    /只有草稿可以修改/,
    "修改待复核设计",
  );
  await expectReject(
    () => flowAdmin.client.pricing.submitDesign.mutate({ id: designId! }),
    "CONFLICT",
    /仅草稿状态可提交复核/,
    "重复提交待复核设计",
  );
  await expectReject(
    () => admin!.client.pricing.publishDesign.mutate({ id: designId! }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "其他管理员发布指标",
  );
  pass("指标提交保存四组测试快照，待复核只读且管理员无发布权限");

  await admin.client.auth.updateUser.mutate({
    id: flowAccount.id,
    name: "流程岗位测试",
    role: "reviewer",
    branch: "省分行",
    position: ROLE_DEFINITIONS.reviewer.label,
    status: "active",
  });
  assert.equal((await rawRpc("pricing.workspace", { cookie: flowAdmin.cookie })).code, "UNAUTHORIZED");
  const flowReviewer = await login(`v4flow-${runId}`, testPassword);
  assert.equal(flowReviewer.user.role, "reviewer");
  await expectReject(
    () => flowReviewer.client.pricing.publishDesign.mutate({ id: designId! }),
    "FORBIDDEN",
    /提交人不能发布本人提交的指标/,
    "提交人发布本人指标",
  );
  await expectReject(
    () => flowReviewer.client.pricing.returnDesign.mutate({ id: designId!, reason: "提交人尝试退回本人指标" }),
    "FORBIDDEN",
    /提交人不能复核本人提交的指标/,
    "提交人退回本人指标",
  );
  pass("角色调整后原会话失效，提交人转为复核角色仍不能复核本人指标");

  const independentTest = await reviewer.client.pricing.testDesign.mutate({ definition });
  assert.equal(independentTest.passed, true);
  await reviewer.client.pricing.returnDesign.mutate({ id: designId, reason: "独立复核退回：请核对单价并重新提交" });
  const returnedDesign = await getDb().query.indicatorDesigns.findFirst({ where: eq(indicatorDesigns.id, designId) });
  assert.equal(returnedDesign?.status, "draft");
  assert.equal(returnedDesign?.testSnapshot, null);
  assert.equal(returnedDesign?.submittedAt, null);

  const revisedDefinition = structuredClone(definition);
  revisedDefinition.positiveRate = 30;
  revisedDefinition.assessment.description = "独立复核退回后调整正向单价；重新完成四组测试、提交和发布，保留完整办理记录。";
  await admin.client.pricing.saveDesign.mutate({ designId, baseVersion: 0, definition: revisedDefinition });
  await admin.client.pricing.submitDesign.mutate({ id: designId });
  const resubmittedDesign = await getDb().query.indicatorDesigns.findFirst({ where: eq(indicatorDesigns.id, designId) });
  assert.equal(resubmittedDesign?.status, "review");
  assert.equal(resubmittedDesign?.submittedBy, admin.user.id);
  const revisedTest = await reviewer.client.pricing.testDesign.mutate({ definition: revisedDefinition });
  assert.equal(revisedTest.passed, true);
  const published = await reviewer.client.pricing.publishDesign.mutate({ id: designId });
  assert.deepEqual(published, { ok: true, id: ruleId, version: 1 });
  designPublished = true;
  rulePublished = true;

  const [publishedRule, publishedDesign] = await Promise.all([
    getDb().query.pricingRules.findFirst({ where: eq(pricingRules.id, ruleId) }),
    getDb().query.indicatorDesigns.findFirst({ where: eq(indicatorDesigns.id, designId) }),
  ]);
  assert.equal(publishedRule?.status, "active");
  assert.equal(publishedRule?.version, 1);
  assert.equal(publishedRule?.positiveRate, 30);
  assert.equal(publishedRule?.name, revisedDefinition.name);
  assert.equal(publishedDesign?.status, "published");
  assert.equal(publishedDesign?.submittedBy, admin.user.id);
  assert.equal(publishedDesign?.publishedBy, reviewer.user.id);
  assert.ok(publishedDesign?.publishedAt);
  await expectReject(
    () => reviewer.client.pricing.publishDesign.mutate({ id: designId! }),
    "CONFLICT",
    /仅待复核状态可发布/,
    "重复发布指标",
  );
  pass("独立退回、修改、重新提交、复测和发布完整留痕，提交人与发布人分离");

  const calcRule = definitionToRule(revisedDefinition, 1);
  const sampleInput: CalcInput = { month: 12, directValue: 128, opening: 8600, current: 9320, previous: 9150, cap: null, floor: null };
  const expectedScore = calculate(calcRule, sampleInput).score;
  assert.equal(expectedScore, 3840);
  const ruleRef = { id: ruleId, name: revisedDefinition.name, version: 1 };
  const managerPerson = { id: manager.user.employeeId, name: manager.user.name };
  const validBranchBatch = batchInput(managerPerson, ruleRef, expectedScore);

  const wrongDetail = structuredClone(validBranchBatch);
  wrongDetail.snapshot[0]!.score = expectedScore + 0.01;
  await expectReject(
    () => branch.client.pricing.saveBatch.mutate(wrongDetail),
    "BAD_REQUEST",
    /浏览器结果与服务端复算不一致/,
    "篡改明细积分",
  );
  const wrongTotal = structuredClone(validBranchBatch);
  wrongTotal.totalScore = expectedScore + 1;
  await expectReject(
    () => branch.client.pricing.saveBatch.mutate(wrongTotal),
    "BAD_REQUEST",
    /批次总积分应为/,
    "篡改批次总积分",
  );
  const wrongCount = structuredClone(validBranchBatch);
  wrongCount.employeeCount = 2;
  await expectReject(
    () => branch.client.pricing.saveBatch.mutate(wrongCount),
    "BAD_REQUEST",
    /计价人数与明细中的实际人数不一致/,
    "篡改计价人数",
  );
  const wrongVersion = structuredClone(validBranchBatch);
  wrongVersion.snapshot[0]!.ruleVersion = 2;
  await expectReject(
    () => branch.client.pricing.saveBatch.mutate(wrongVersion),
    "CONFLICT",
    /已更新为V1/,
    "过期规则版本",
  );
  const crossBranch = batchInput({ id: "E1162", name: "赵清和" }, ruleRef, expectedScore);
  await expectReject(
    () => branch.client.pricing.saveBatch.mutate(crossBranch),
    "FORBIDDEN",
    /不在当前账号的数据范围内/,
    "跨机构人员写入批次",
  );
  await expectReject(
    () => employee.client.pricing.saveBatch.mutate(batchInput({ id: employee.user.employeeId, name: employee.user.name }, ruleRef, expectedScore)),
    "FORBIDDEN",
    /没有此项操作权限/,
    "员工保存正式批次",
  );
  await expectReject(
    () => reviewer.client.pricing.saveBatch.mutate(validBranchBatch),
    "FORBIDDEN",
    /没有此项操作权限/,
    "复核人员保存正式批次",
  );
  pass("篡改积分、总积分、人数、规则版本及跨机构人员均被服务端拒绝");

  validBranchBatch.snapshot[0]!.employee = "伪造人员姓名";
  validBranchBatch.snapshot[0]!.ruleName = "伪造指标名称";
  const savedBranchBatch = await branch.client.pricing.saveBatch.mutate(validBranchBatch);
  branchBatchId = savedBranchBatch.id;
  const storedBranchBatch = await getDb().query.batches.findFirst({ where: eq(batches.id, branchBatchId) });
  const storedSnapshot = storedBranchBatch?.resultSnapshot as Array<Record<string, unknown>> | null;
  assert.equal(storedBranchBatch?.status, "draft");
  assert.equal(storedBranchBatch?.ownerBranch, branch.user.branch);
  assert.equal(storedBranchBatch?.createdBy, branch.user.id);
  assert.equal(storedBranchBatch?.totalScore, expectedScore);
  assert.equal(storedSnapshot?.[0]?.employee, manager.user.name);
  assert.equal(storedSnapshot?.[0]?.ruleName, revisedDefinition.name);
  assert.equal(storedSnapshot?.[0]?.ruleVersion, 1);
  assert.ok(storedSnapshot?.[0]?.ruleDefinition);
  assert.notEqual(storedSnapshot?.[0]?.expression, "浏览器占位表达式，服务端必须重算");
  await branch.client.pricing.submitBatch.mutate({ id: branchBatchId });
  await expectReject(
    () => branch.client.pricing.approveBatch.mutate({ id: branchBatchId! }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "机构负责人审批批次",
  );
  await expectReject(
    () => admin!.client.pricing.approveBatch.mutate({ id: branchBatchId! }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "管理员审批批次",
  );
  await reviewer.client.pricing.approveBatch.mutate({ id: branchBatchId });
  const lockedBranchBatch = await getDb().query.batches.findFirst({ where: eq(batches.id, branchBatchId) });
  assert.equal(lockedBranchBatch?.status, "locked");
  assert.equal(lockedBranchBatch?.submittedBy, branch.user.id);
  assert.equal(lockedBranchBatch?.approvedBy, reviewer.user.id);
  assert.ok(lockedBranchBatch?.approvedAt);
  await expectReject(
    () => branch.client.pricing.submitBatch.mutate({ id: branchBatchId! }),
    "CONFLICT",
    /只有草稿批次可以提交复核/,
    "重复提交已锁定批次",
  );
  await expectReject(
    () => reviewer.client.pricing.approveBatch.mutate({ id: branchBatchId! }),
    "CONFLICT",
    /只有复核中的批次可以审批锁定/,
    "重复审批已锁定批次",
  );
  pass("正常批次由服务端复算并覆盖伪造快照，提交、独立审批和锁定状态一致");

  await admin.client.auth.updateUser.mutate({
    id: flowAccount.id,
    name: "流程岗位测试",
    role: "pricing_admin",
    branch: "省分行",
    position: ROLE_DEFINITIONS.pricing_admin.label,
    status: "active",
  });
  const flowAdminAgain = await login(`v4flow-${runId}`, testPassword);
  const separationInput = batchInput({ id: "E1162", name: "赵清和" }, ruleRef, expectedScore);
  separationInput.title = `${period} 提交审批分离验收 ${runId}`;
  const savedSeparationBatch = await flowAdminAgain.client.pricing.saveBatch.mutate(separationInput);
  separationBatchId = savedSeparationBatch.id;
  await expectReject(
    () => branch.client.pricing.submitBatch.mutate({ id: separationBatchId! }),
    "FORBIDDEN",
    /不能提交其他机构的批次/,
    "机构负责人提交跨机构批次",
  );
  await flowAdminAgain.client.pricing.submitBatch.mutate({ id: separationBatchId });
  await admin.client.auth.updateUser.mutate({
    id: flowAccount.id,
    name: "流程岗位测试",
    role: "reviewer",
    branch: "省分行",
    position: ROLE_DEFINITIONS.reviewer.label,
    status: "active",
  });
  assert.equal((await rawRpc("pricing.workspace", { cookie: flowAdminAgain.cookie })).code, "UNAUTHORIZED");
  const flowReviewerAgain = await login(`v4flow-${runId}`, testPassword);
  await expectReject(
    () => flowReviewerAgain.client.pricing.approveBatch.mutate({ id: separationBatchId! }),
    "FORBIDDEN",
    /提交人不能审批本人提交的批次/,
    "提交人审批本人批次",
  );
  await reviewer.client.pricing.approveBatch.mutate({ id: separationBatchId });
  const lockedSeparationBatch = await getDb().query.batches.findFirst({ where: eq(batches.id, separationBatchId) });
  assert.equal(lockedSeparationBatch?.status, "locked");
  assert.equal(lockedSeparationBatch?.submittedBy, flowAccount.id);
  assert.equal(lockedSeparationBatch?.approvedBy, reviewer.user.id);
  pass("批次提交人转为复核角色仍不能审批本人批次，跨机构提交被阻断");

  const allocationBase = {
    ruleId,
    period,
    reason: "V4验收：客户经理本人参与的本机构协同分润",
  };
  await expectReject(
    () => manager.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: employee.user.employeeId,
      employeeName: employee.user.name,
      branch: employee.user.branch,
      ratio: 40,
    }),
    "FORBIDDEN",
    /请先登记本人参与记录/,
    "客户经理未参与却为他人登记分润",
  );
  await expectReject(
    () => manager.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: "E1162",
      employeeName: "赵清和",
      branch: "高新支行",
      ratio: 10,
    }),
    "FORBIDDEN",
    /客户经理只能登记本机构人员/,
    "客户经理跨机构分润",
  );
  await expectReject(
    () => branch.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: "E1162",
      employeeName: "赵清和",
      branch: "高新支行",
      ratio: 10,
    }),
    "FORBIDDEN",
    /机构负责人只能登记本机构人员/,
    "机构负责人跨机构分润",
  );
  await expectReject(
    () => employee.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: employee.user.employeeId,
      employeeName: employee.user.name,
      branch: employee.user.branch,
      ratio: 10,
    }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "普通员工登记分润",
  );
  await expectReject(
    () => leader.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: manager.user.employeeId,
      employeeName: manager.user.name,
      branch: manager.user.branch,
      ratio: 10,
    }),
    "FORBIDDEN",
    /没有此项操作权限/,
    "领导登记分润",
  );
  await manager.client.pricing.createAllocation.mutate({
    ...allocationBase,
    employeeId: manager.user.employeeId,
    employeeName: manager.user.name,
    branch: manager.user.branch,
    ratio: 60,
  });
  await manager.client.pricing.createAllocation.mutate({
    ...allocationBase,
    employeeId: employee.user.employeeId,
    employeeName: "伪造人员姓名",
    branch: "伪造机构名称",
    ratio: 40,
    reason: "V4验收：本人已参与后添加协同人员，人员信息以服务端目录为准",
  });
  await expectReject(
    () => manager.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: manager.user.employeeId,
      employeeName: manager.user.name,
      branch: manager.user.branch,
      ratio: 0.01,
    }),
    "CONFLICT",
    /超过100%/,
    "分润比例合计超过100%",
  );
  const storedAllocations = await getDb().select().from(allocations).where(and(
    eq(allocations.ruleId, ruleId),
    eq(allocations.period, period),
  ));
  assert.equal(storedAllocations.length, 2);
  assert.equal(storedAllocations.reduce((sum, row) => sum + row.ratio, 0), 100);
  const employeeAllocation = storedAllocations.find((row) => row.employeeId === employee.user.employeeId);
  assert.equal(employeeAllocation?.employeeName, employee.user.name);
  assert.equal(employeeAllocation?.branch, employee.user.branch);
  assert.equal(employeeAllocation?.createdByEmployeeId, manager.user.employeeId);
  pass("客户经理须本人参与且限本机构，分润人员信息由服务端确定且合计不超过100%");

  const disabledAccount = await createTestAccount(
    admin,
    `v4off-${runId}`,
    `V4D${idSuffix}`,
    "停用账号测试",
    "employee",
    "城东支行",
  );
  const disabledSession = await login(`v4off-${runId}`, testPassword);
  await admin.client.auth.updateUser.mutate({
    id: disabledAccount.id,
    name: "停用账号测试",
    role: "employee",
    branch: "城东支行",
    position: ROLE_DEFINITIONS.employee.label,
    status: "disabled",
  });
  assert.equal((await rawRpc("auth.me", { cookie: disabledSession.cookie })).data, null);
  assert.equal((await rawRpc("pricing.workspace", { cookie: disabledSession.cookie })).code, "UNAUTHORIZED");
  const disabledLogin = await rawRpc("auth.login", {
    mutation: true,
    input: { username: `v4off-${runId}`, password: testPassword },
  });
  assert.equal(disabledLogin.status, 401);
  assert.equal(disabledLogin.code, "UNAUTHORIZED");
  assert.match(disabledLogin.message ?? "", /账号已停用/);
  await expectReject(
    () => manager.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: `V4D${idSuffix}`,
      employeeName: "停用账号测试",
      branch: "城东支行",
      ratio: 1,
    }),
    "BAD_REQUEST",
    /账号已停用，不能登记新的分润/,
    "停用人员新增分润",
  );
  pass("停用账号原会话失效且不能重新登录，停用人员不能新增分润");

  await admin.client.pricing.setRuleStatus.mutate({ id: ruleId, status: "disabled", reason: "V4验收完成，停用独立测试指标并保留历史记录" });
  ruleDisabled = true;
  const disabledRule = await getDb().query.pricingRules.findFirst({ where: eq(pricingRules.id, ruleId) });
  assert.equal(disabledRule?.status, "disabled");
  assert.equal(disabledRule?.version, 2);
  await expectReject(
    () => manager.client.pricing.createAllocation.mutate({
      ...allocationBase,
      employeeId: manager.user.employeeId,
      employeeName: manager.user.name,
      branch: manager.user.branch,
      ratio: 1,
    }),
    "BAD_REQUEST",
    /只能为当前正式启用的指标登记分润/,
    "停用指标新增分润",
  );
  pass("测试指标停用后不能继续登记分润，规则版本和历史业务记录保留");

  summary = {
    status: "pass",
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
    checkCount: checks.length,
    accounts: DEMO_ACCOUNTS.map((account) => account.username),
    testArtifacts: {
      ruleId,
      designId,
      branchBatchId,
      separationBatchId,
      createdUserIds: createdUsers.map((user) => user.id),
      retained: true,
    },
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
    testArtifacts: { ruleId, designId, branchBatchId, separationBatchId },
  };
} finally {
  const cleanup: string[] = [];
  const cleanupErrors: string[] = [];
  try {
    const db = getDb();
    const testRule = await db.query.pricingRules.findFirst({ where: eq(pricingRules.id, ruleId) });
    if (testRule && testRule.status !== "disabled") {
      await db.update(pricingRules).set({
        status: "disabled",
        version: testRule.version + 1,
        updatedAt: new Date(),
      }).where(eq(pricingRules.id, ruleId));
      cleanup.push("测试规则已停用");
    }
    if (designId && !designPublished) {
      await db.update(indicatorDesigns).set({ status: "archived", updatedAt: new Date() }).where(and(
        eq(indicatorDesigns.id, designId),
        inArray(indicatorDesigns.status, ["draft", "review"]),
      ));
      cleanup.push("未完成测试设计稿已归档");
    }
    const userIds = createdUsers.map((user) => user.id);
    if (userIds.length) {
      await db.update(appUsers).set({ status: "disabled", updatedAt: new Date() }).where(inArray(appUsers.id, userIds));
      await db.delete(authSessions).where(inArray(authSessions.userId, userIds));
      cleanup.push("独立测试账号已停用，测试会话已注销");
    }
    cleanup.push("未删除测试设计、批次、分润或审计记录");
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error.stack : String(error));
  }
  summary = {
    ...summary,
    cleanup,
    cleanupErrors,
    rulePublished,
    ruleDisabled,
    designPublished,
  };
  if (cleanupErrors.length && exitCode === 0) {
    exitCode = 1;
    summary.status = "fail";
    summary.error = `验收后清理失败：${cleanupErrors.join("；")}`;
  }
  await finish(summary, exitCode);
  try {
    const client = (getDb() as unknown as { $client?: { end?: () => Promise<void> } }).$client;
    await client?.end?.();
  } catch {
    // 验证结果已经落盘；连接池关闭失败不掩盖业务验收结果。
  }
  console.log(JSON.stringify(summary));
  process.exitCode = exitCode;
}
