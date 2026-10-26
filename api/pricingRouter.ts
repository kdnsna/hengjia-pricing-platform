import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { authedQuery, createRouter, permittedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { allocations, appUsers, auditLogs, batches, indicatorDesigns, pricingRules } from "@db/schema";
import { calculate, DEMO_EMPLOYEES, PRICING_RULES, type CalcInput, type IndicatorDefinition, type PricingRule } from "@contracts/pricing";
import { hasPermission, type AccessUser } from "@contracts/access";
import { definitionToRule, testIndicator, validateIndicator } from "@contracts/indicator";
import { recordAudit } from "./audit";
import { assertAllocationConfirmation, assertBatchAction } from "./workflow";

async function log(user: AccessUser | null, action: string, objectType: string, objectId: string, detail: string) {
  await recordAudit(user, action, objectType, objectId, detail);
}

const assessmentSchema = z.object({
  cycle: z.enum(["月度", "季度", "年度", "按批次"]),
  targetValue: z.number().nullable(),
  weight: z.number().min(0).max(100).nullable(),
  cap: z.number().nullable(),
  floor: z.number().nullable(),
  precision: z.number().int().min(0).max(6),
  rounding: z.enum(["四舍五入", "向下取整", "向上取整"]),
  applicableOrgs: z.string().max(500),
  applicableRoles: z.string().max(500),
  attribution: z.enum(["主办优先", "按比例分润", "机构归属"]),
  allowNegative: z.boolean(),
  evidenceRequired: z.boolean(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviewFlow: z.enum(["一级复核", "两级复核"]),
  description: z.string().max(2000),
  exclusions: z.string().max(2000),
});

const definitionSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]{2,31}$/),
  name: z.string().min(1).max(160),
  category: z.enum(["利润", "规模", "客户"]),
  group: z.string().min(1).max(64),
  unit: z.enum(["元/万元", "元/户", "元/笔"]),
  department: z.string().max(100),
  owner: z.string().max(64),
  description: z.string().max(2000),
  sourceSystem: z.string().max(160),
  sourceCode: z.string().max(32),
  metricCode: z.string().max(32),
  sourceUnit: z.enum(["元", "万元", "户", "笔"]),
  unitFactor: z.number().positive(),
  method: z.enum(["direct", "stock_monthly", "weighted_growth", "quarterly_growth", "custom"]),
  stockRate: z.number().min(0).nullable(),
  positiveRate: z.number().min(0).nullable(),
  negativeRate: z.number().min(0).nullable(),
  formula: z.string().min(1).max(2000),
  assessment: assessmentSchema,
});

const designInput = z.object({
  designId: z.number().int().positive().optional(),
  baseVersion: z.number().int().min(0),
  definition: definitionSchema,
});

const calcInputSchema = z.object({
  month: z.number().int().min(1).max(12),
  directValue: z.number().finite(),
  opening: z.number().finite(),
  current: z.number().finite(),
  previous: z.number().finite(),
  cap: z.number().finite().nullish(),
  floor: z.number().finite().nullish(),
});

const batchSnapshotSchema = z.object({
  employee: z.string().min(1).max(64),
  employeeId: z.string().min(1).max(32),
  ruleId: z.string().min(1).max(32),
  ruleName: z.string().min(1).max(160),
  ruleVersion: z.number().int().positive(),
  ruleDefinition: z.unknown().nullish(),
  input: calcInputSchema,
  score: z.number().finite(),
  expression: z.string().max(4000),
}).passthrough();

type BatchSnapshotInput = z.infer<typeof batchSnapshotSchema>;

async function getDesign(id: number) {
  const row = await getDb().query.indicatorDesigns.findFirst({ where: eq(indicatorDesigns.id, id) });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "指标设计稿不存在" });
  return row;
}

function asDefinition(value: unknown): IndicatorDefinition {
  return value as IndicatorDefinition;
}

function assertTests(definition: IndicatorDefinition) {
  const validation = validateIndicator(definition);
  if (validation.errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: validation.errors.join("；") });
  const tested = testIndicator(definition);
  if (!tested.passed) {
    const failed = tested.results.filter((result) => !result.passed).map((result) => `${result.name}：${result.error ?? "失败"}`);
    throw new TRPCError({ code: "BAD_REQUEST", message: `提交或发布前测试未通过：${failed.join("；")}` });
  }
  return tested.results;
}

async function assertBaseVersion(ruleId: string, baseVersion: number) {
  const current = await getDb().query.pricingRules.findFirst({ where: eq(pricingRules.id, ruleId) });
  if (baseVersion === 0) {
    if (current) throw new TRPCError({ code: "CONFLICT", message: `指标编码 ${ruleId} 已存在，请更换编码或从正式指标创建新版` });
    return null;
  }
  if (!current) throw new TRPCError({ code: "CONFLICT", message: "新版所依据的正式指标不存在" });
  if (current.version !== baseVersion) throw new TRPCError({ code: "CONFLICT", message: `正式指标已更新为V${current.version}，请基于最新版本重新设计` });
  return current;
}

function asRule(row: typeof pricingRules.$inferSelect): PricingRule {
  return {
    id: row.id,
    name: row.name,
    category: row.category as PricingRule["category"],
    group: row.groupName,
    unit: row.unit as PricingRule["unit"],
    stockRate: row.stockRate,
    positiveRate: row.positiveRate,
    negativeRate: row.negativeRate,
    method: row.method as PricingRule["method"],
    sourceCode: row.sourceCode ?? undefined,
    metricCode: row.metricCode ?? undefined,
    status: row.status as PricingRule["status"],
    note: row.note ?? undefined,
    formula: row.formula ?? undefined,
    version: row.version,
    definition: row.definition ? asDefinition(row.definition) : undefined,
    updatedAt: row.updatedAt,
  };
}

async function resolvePerson(employeeId: string) {
  const account = await getDb().query.appUsers.findFirst({ where: eq(appUsers.employeeId, employeeId) });
  if (account) {
    if (account.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: `人员 ${employeeId} 的账号已停用，不能登记新的分润` });
    return { id: account.employeeId, name: account.name, branch: account.branch, role: account.position };
  }
  const demo = DEMO_EMPLOYEES.find((person) => person.id === employeeId);
  if (demo) return demo;
  throw new TRPCError({ code: "BAD_REQUEST", message: `人员 ${employeeId} 不在可用人员目录中` });
}

async function peopleFor(user: AccessUser) {
  if (user.scope === "self") return [{ id: user.employeeId, name: user.name, branch: user.branch, role: user.position }];
  const accounts = await getDb().select({ employeeId: appUsers.employeeId, name: appUsers.name, branch: appUsers.branch, position: appUsers.position }).from(appUsers).where(eq(appUsers.status, "active"));
  const all = new Map<string, { id: string; name: string; branch: string; role: string }>();
  for (const person of DEMO_EMPLOYEES) all.set(person.id, person);
  for (const person of accounts) all.set(person.employeeId, { id: person.employeeId, name: person.name, branch: person.branch, role: person.position });
  return [...all.values()].filter((person) => user.scope === "all" || person.branch === user.branch);
}

async function getBatch(id: number) {
  const batch = await getDb().query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "计价批次不存在" });
  return batch;
}

async function checkBatchSnapshot(user: AccessUser, items: BatchSnapshotInput[], verifyScores = true) {
  const db = getDb();
  const [ruleRows, allowedPeople] = await Promise.all([
    db.select().from(pricingRules),
    peopleFor(user),
  ]);
  const peopleById = new Map(allowedPeople.map((person) => [person.id, person]));
  const rulesById = new Map(ruleRows.map((rule) => [rule.id, rule]));
  const checkedSnapshot = [];
  for (const item of items) {
    const person = peopleById.get(item.employeeId);
    if (!person) throw new TRPCError({ code: "FORBIDDEN", message: `人员 ${item.employeeId} 不在当前账号的数据范围内` });
    const ruleRow = rulesById.get(item.ruleId);
    if (!ruleRow || ruleRow.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: `指标 ${item.ruleId} 当前不可用于正式试算` });
    if (item.ruleVersion !== ruleRow.version) throw new TRPCError({ code: "CONFLICT", message: `${item.ruleName} 已更新为V${ruleRow.version}，请刷新后重新试算` });
    const result = calculate(asRule(ruleRow), item.input as CalcInput);
    if (verifyScores && Math.abs(result.score - item.score) > 0.001) throw new TRPCError({ code: "BAD_REQUEST", message: `${item.ruleName} 的浏览器结果与服务端复算不一致，请重新计算` });
    checkedSnapshot.push({
      employee: person.name,
      employeeId: person.id,
      ruleId: ruleRow.id,
      ruleName: ruleRow.name,
      ruleVersion: ruleRow.version,
      ruleDefinition: ruleRow.definition,
      input: item.input,
      score: result.score,
      expression: result.expression,
      branch: person.branch,
    });
  }
  return checkedSnapshot;
}

export async function ensureSeed() {
  const db = getDb();
  const existing = await db.select({ id: pricingRules.id }).from(pricingRules);
  if (existing.length === 0) {
    await db.insert(pricingRules).values(PRICING_RULES.map((rule) => ({
      id: rule.id, name: rule.name, category: rule.category, groupName: rule.group, unit: rule.unit,
      stockRate: rule.stockRate, positiveRate: rule.positiveRate, negativeRate: rule.negativeRate,
      method: rule.method, sourceCode: rule.sourceCode, metricCode: rule.metricCode, status: rule.status, note: rule.note,
    })));
    await log(null, "初始化", "规则版本", "2026-V1", "导入2026年全员全产品计价指标表51项规则");
  }
  const batch = await db.select({ id: batches.id }).from(batches).limit(1);
  if (batch.length === 0) {
    await db.insert(batches).values([
      { period: "2026-09", title: "9月全员计价试算", totalScore: 186420.5, employeeCount: 126, status: "locked", resultSnapshot: [{ name: "林书言", score: 4862.35 }], approvedAt: new Date() },
      { period: "2026-10", title: "10月全员计价试算", totalScore: 192860.8, employeeCount: 128, status: "review", resultSnapshot: [{ name: "林书言", score: 5210.2 }] },
    ]);
    await db.insert(allocations).values([
      { employeeId: "E1027", employeeName: "林书言", branch: "城东支行", ruleId: "P015", period: "2026-10", ratio: 60, reason: "客户主办，负责方案与持续服务", status: "approved" },
      { employeeId: "E1086", employeeName: "周明远", branch: "城东支行", ruleId: "P015", period: "2026-10", ratio: 40, reason: "协同识别需求并完成双录", status: "approved" },
    ]);
  }
}

export const pricingRouter = createRouter({
  workspace: authedQuery.query(async ({ ctx }) => {
    await ensureSeed();
    const db = getDb();
    const [rules, designs, shares, batchRows, logs, people] = await Promise.all([
      db.select().from(pricingRules).orderBy(asc(pricingRules.id)),
      db.select().from(indicatorDesigns).orderBy(desc(indicatorDesigns.updatedAt)).limit(200),
      db.select().from(allocations).orderBy(desc(allocations.createdAt)),
      db.select().from(batches).orderBy(desc(batches.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(80),
      peopleFor(ctx.user),
    ]);
    const canSeeAllRules = ctx.user.scope === "all";
    const visibleRules = canSeeAllRules ? rules : rules.filter((rule) => rule.status === "active");
    const visibleDesigns = hasPermission(ctx.user, "design:view") ? designs : [];
    const visibleShares = ctx.user.scope === "all" ? shares : ctx.user.scope === "branch"
      ? shares.filter((share) => share.branch === ctx.user.branch)
      : shares.filter((share) => share.employeeId === ctx.user.employeeId || share.createdByEmployeeId === ctx.user.employeeId);
    const visibleBatches = !hasPermission(ctx.user, "batch:view") ? [] : ctx.user.scope === "all"
      ? batchRows
      : batchRows.filter((batch) => batch.ownerBranch === ctx.user.branch);
    const allocationPeople = ctx.user.role === "relationship_manager" ? await peopleFor({ ...ctx.user, scope: "branch" }) : people;
    return {
      rules: visibleRules,
      designs: visibleDesigns,
      shares: visibleShares,
      batches: visibleBatches,
      logs: hasPermission(ctx.user, "logs:view") ? logs : [],
      people,
      allocationPeople,
    };
  }),

  testDesign: permittedQuery("design:test").input(z.object({ definition: definitionSchema })).mutation(async ({ input }) => {
    const definition = input.definition as IndicatorDefinition;
    return { validation: validateIndicator(definition), ...testIndicator(definition) };
  }),

  saveDesign: permittedQuery("design:manage").input(designInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const definition = input.definition as IndicatorDefinition;
    if (input.designId) {
      const current = await getDesign(input.designId);
      if (current.status !== "draft") throw new TRPCError({ code: "CONFLICT", message: "只有草稿可以修改；待复核、已发布或已归档的设计稿均为只读" });
      if (current.ruleId !== definition.id) throw new TRPCError({ code: "BAD_REQUEST", message: "设计稿创建后不可更换指标编码" });
      await assertBaseVersion(definition.id, input.baseVersion);
      await db.update(indicatorDesigns).set({
        name: definition.name,
        definition,
        baseVersion: input.baseVersion,
        status: "draft",
        testSnapshot: null,
        submittedAt: null,
        updatedAt: new Date(),
      }).where(eq(indicatorDesigns.id, input.designId));
      await log(ctx.user, "保存指标设计", "指标设计稿", String(input.designId), `${definition.id} ${definition.name}：更新草稿，等待测试与复核`);
      return { ok: true, id: input.designId, status: "draft" as const };
    }
    await assertBaseVersion(definition.id, input.baseVersion);
    const open = await db.select({ id: indicatorDesigns.id }).from(indicatorDesigns).where(and(
      eq(indicatorDesigns.ruleId, definition.id),
      inArray(indicatorDesigns.status, ["draft", "review"]),
    )).limit(1);
    if (open.length) throw new TRPCError({ code: "CONFLICT", message: "该指标已有未发布设计稿，请继续编辑现有草稿" });
    const [{ id }] = await db.insert(indicatorDesigns).values({
      ruleId: definition.id,
      name: definition.name,
      baseVersion: input.baseVersion,
      definition,
      status: "draft",
      createdBy: ctx.user.id,
    }).$returningId();
    await log(ctx.user, "新建指标设计", "指标设计稿", String(id), `${definition.id} ${definition.name}：创建${input.baseVersion ? `V${input.baseVersion + 1}` : "首个版本"}草稿`);
    return { ok: true, id, status: "draft" as const };
  }),

  submitDesign: permittedQuery("design:manage").input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const design = await getDesign(input.id);
    if (design.status !== "draft") throw new TRPCError({ code: "CONFLICT", message: "仅草稿状态可提交复核" });
    const definition = asDefinition(design.definition);
    const results = assertTests(definition);
    await assertBaseVersion(design.ruleId, design.baseVersion);
    await getDb().update(indicatorDesigns).set({
      status: "review",
      testSnapshot: results.map((result) => ({ name: result.name, score: result.score, expression: result.expression })),
      submittedAt: new Date(),
      submittedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(eq(indicatorDesigns.id, input.id));
    await log(ctx.user, "提交指标复核", "指标设计稿", String(input.id), `${design.ruleId} ${design.name}：四组场景测试通过，进入复核`);
    return { ok: true };
  }),

  publishDesign: permittedQuery("design:publish").input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const design = await getDesign(input.id);
    if (design.status !== "review") throw new TRPCError({ code: "CONFLICT", message: "仅待复核状态可发布，草稿须先完成测试并提交复核" });
    if (design.submittedBy === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "提交人不能发布本人提交的指标，请由其他复核人员办理" });
    const definition = asDefinition(design.definition);
    assertTests(definition);
    await assertBaseVersion(design.ruleId, design.baseVersion);
    const version = design.baseVersion + 1;
    const rule = definitionToRule(definition, version);
    const values = {
      name: rule.name,
      category: rule.category,
      groupName: rule.group,
      unit: rule.unit,
      stockRate: rule.stockRate,
      positiveRate: rule.positiveRate,
      negativeRate: rule.negativeRate,
      method: rule.method,
      sourceCode: rule.sourceCode,
      metricCode: rule.metricCode,
      status: "active",
      note: rule.note,
      formula: rule.formula,
      definition,
      version,
      updatedAt: new Date(),
    };
    if (design.baseVersion === 0) await db.insert(pricingRules).values({ id: rule.id, ...values });
    else await db.update(pricingRules).set(values).where(eq(pricingRules.id, rule.id));
    await db.update(indicatorDesigns).set({ status: "published", publishedAt: new Date(), publishedBy: ctx.user.id, updatedAt: new Date() }).where(eq(indicatorDesigns.id, input.id));
    await log(ctx.user, "发布指标", "计价规则", rule.id, `${rule.name} V${version} 已发布；公式、单价与考核细则形成版本快照`);
    return { ok: true, id: rule.id, version };
  }),

  returnDesign: permittedQuery("design:publish").input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(4).max(500) })).mutation(async ({ ctx, input }) => {
    const design = await getDesign(input.id);
    if (design.status !== "review") throw new TRPCError({ code: "CONFLICT", message: "只有待复核的设计稿可以退回" });
    if (design.submittedBy === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "提交人不能复核本人提交的指标，请由其他复核人员办理" });
    await getDb().update(indicatorDesigns).set({ status: "draft", testSnapshot: null, submittedAt: null, updatedAt: new Date() }).where(eq(indicatorDesigns.id, input.id));
    await log(ctx.user, "退回指标设计", "指标设计稿", String(input.id), `${design.ruleId} ${design.name}：${input.reason}`);
    return { ok: true };
  }),

  archiveDesign: permittedQuery("design:manage").input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const design = await getDesign(input.id);
    if (["published", "archived"].includes(design.status)) throw new TRPCError({ code: "CONFLICT", message: "该设计稿已归档或已发布" });
    await getDb().update(indicatorDesigns).set({ status: "archived", updatedAt: new Date() }).where(eq(indicatorDesigns.id, input.id));
    await log(ctx.user, "归档设计稿", "指标设计稿", String(input.id), `${design.ruleId} ${design.name}：未发布，仅保留历史记录`);
    return { ok: true };
  }),

  setRuleStatus: permittedQuery("rules:manage").input(z.object({ id: z.string(), status: z.enum(["active", "disabled"]), reason: z.string().min(4).max(500) })).mutation(async ({ ctx, input }) => {
    const current = await getDb().query.pricingRules.findFirst({ where: eq(pricingRules.id, input.id) });
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "正式指标不存在" });
    await getDb().update(pricingRules).set({ status: input.status, version: current.version + 1, updatedAt: new Date() }).where(eq(pricingRules.id, input.id));
    await log(ctx.user, input.status === "active" ? "启用指标" : "停用指标", "计价规则", input.id, `${current.name}：${input.reason}`);
    return { ok: true };
  }),

  createAllocation: permittedQuery("allocation:manage").input(z.object({
    employeeId: z.string().min(1).max(32), employeeName: z.string().min(1).max(64), branch: z.string().min(1).max(80), ruleId: z.string().min(1).max(32), period: z.string().regex(/^\d{4}-\d{2}$/), ratio: z.number().positive().max(100), reason: z.string().trim().min(4).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [person, rule, existing] = await Promise.all([
      resolvePerson(input.employeeId),
      db.query.pricingRules.findFirst({ where: eq(pricingRules.id, input.ruleId) }),
      db.select({ employeeId: allocations.employeeId, ratio: allocations.ratio }).from(allocations).where(and(eq(allocations.period, input.period), eq(allocations.ruleId, input.ruleId))),
    ]);
    if (!rule || rule.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "只能为当前正式启用的指标登记分润" });
    if (ctx.user.scope === "branch" && person.branch !== ctx.user.branch) throw new TRPCError({ code: "FORBIDDEN", message: "机构负责人只能登记本机构人员的分润" });
    if (ctx.user.scope === "self") {
      if (person.branch !== ctx.user.branch) throw new TRPCError({ code: "FORBIDDEN", message: "客户经理只能登记本机构人员的协同分润" });
      const participates = person.id === ctx.user.employeeId || existing.some((row) => row.employeeId === ctx.user.employeeId);
      if (!participates) throw new TRPCError({ code: "FORBIDDEN", message: "请先登记本人参与记录，再添加该项业务的协同人员" });
    }
    const currentTotal = existing.reduce((sum, row) => sum + row.ratio, 0);
    if (currentTotal + input.ratio > 100.0001) throw new TRPCError({ code: "CONFLICT", message: `该产品现有分润比例合计${currentTotal.toFixed(2)}%，新增后将超过100%` });
    await db.insert(allocations).values({
      employeeId: person.id,
      employeeName: person.name,
      branch: person.branch,
      ruleId: input.ruleId,
      period: input.period,
      ratio: input.ratio,
      reason: input.reason,
      createdBy: ctx.user.id,
      createdByEmployeeId: ctx.user.employeeId,
    });
    await log(ctx.user, "新增归属", "业绩分润", input.employeeId, `${input.period} ${input.ruleId} ${input.ratio}%：${input.reason}`);
    return { ok: true };
  }),

  confirmAllocation: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const allocation = await db.query.allocations.findFirst({ where: eq(allocations.id, input.id) });
    if (!allocation) throw new TRPCError({ code: "NOT_FOUND", message: "分润记录不存在" });
    assertAllocationConfirmation(allocation, ctx.user);
    const confirmedAt = new Date();
    const [result] = await db.update(allocations).set({ status: "approved", confirmedBy: ctx.user.id, confirmedAt }).where(and(
      eq(allocations.id, input.id),
      eq(allocations.employeeId, ctx.user.employeeId),
      eq(allocations.status, "pending"),
    ));
    if (!result.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "分润状态已变化，请刷新后再确认" });
    await log(ctx.user, "确认分润", "业绩分润", String(input.id), `${allocation.period} ${allocation.ruleId} ${allocation.employeeName}确认${allocation.ratio}%分润归属`);
    return { ok: true, confirmedAt };
  }),

  saveBatch: permittedQuery("batch:save").input(z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/), title: z.string().trim().min(2).max(100), totalScore: z.number().finite(), employeeCount: z.number().int().positive().max(500), snapshot: z.array(batchSnapshotSchema).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const checkedSnapshot = await checkBatchSnapshot(ctx.user, input.snapshot);
    const employeeIds = new Set(checkedSnapshot.map((item) => item.employeeId));
    const branchNames = new Set(checkedSnapshot.map((item) => item.branch));
    if (employeeIds.size !== input.employeeCount) throw new TRPCError({ code: "BAD_REQUEST", message: "计价人数与明细中的实际人数不一致" });
    const computedTotal = Number(checkedSnapshot.reduce((sum, item) => sum + item.score, 0).toFixed(2));
    if (Math.abs(computedTotal - input.totalScore) > 0.001) throw new TRPCError({ code: "BAD_REQUEST", message: `批次总积分应为 ${computedTotal.toFixed(2)}，请重新计算后保存` });
    const [{ id }] = await db.insert(batches).values({
      period: input.period,
      title: input.title,
      totalScore: computedTotal,
      employeeCount: input.employeeCount,
      status: "draft",
      resultSnapshot: checkedSnapshot,
      ownerEmployeeId: employeeIds.size === 1 ? [...employeeIds][0] : "",
      ownerBranch: branchNames.size === 1 ? [...branchNames][0] : ctx.user.branch,
      createdBy: ctx.user.id,
      createdByName: ctx.user.name,
    }).$returningId();
    await log(ctx.user, "保存试算", "计价批次", String(id), `${input.title}，服务端复算 ${checkedSnapshot.length} 条明细，合计 ${computedTotal.toFixed(2)} 积分`);
    return { ok: true, id };
  }),

  updateBatch: permittedQuery("batch:save").input(z.object({
    id: z.number().int().positive(),
    title: z.string().trim().min(2).max(100),
    snapshot: z.array(batchSnapshotSchema).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    const batch = await getBatch(input.id);
    assertBatchAction(batch, "edit", ctx.user);
    const checkedSnapshot = await checkBatchSnapshot(ctx.user, input.snapshot, false);
    const employeeIds = new Set(checkedSnapshot.map((item) => item.employeeId));
    const branchNames = new Set(checkedSnapshot.map((item) => item.branch));
    const computedTotal = Number(checkedSnapshot.reduce((sum, item) => sum + item.score, 0).toFixed(2));
    const [result] = await getDb().update(batches).set({
      title: input.title,
      totalScore: computedTotal,
      employeeCount: employeeIds.size,
      resultSnapshot: checkedSnapshot,
      ownerEmployeeId: employeeIds.size === 1 ? [...employeeIds][0] : "",
      ownerBranch: branchNames.size === 1 ? [...branchNames][0] : ctx.user.branch,
    }).where(and(eq(batches.id, input.id), eq(batches.status, "draft")));
    if (!result.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "批次状态已变化，请刷新后再修改" });
    await log(ctx.user, "修改批次", "计价批次", String(input.id), `${batch.title}：服务端重新复算 ${checkedSnapshot.length} 条明细，积分由 ${batch.totalScore.toFixed(2)} 调整为 ${computedTotal.toFixed(2)}`);
    return { ok: true, id: input.id, totalScore: computedTotal, employeeCount: employeeIds.size };
  }),

  submitBatch: permittedQuery("batch:submit").input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const batch = await getBatch(input.id);
    assertBatchAction(batch, "submit", ctx.user);
    const [result] = await getDb().update(batches).set({ status: "review", submittedBy: ctx.user.id, submittedAt: new Date() }).where(and(eq(batches.id, input.id), eq(batches.status, "draft")));
    if (!result.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "批次状态已变化，请刷新后重新提交" });
    await log(ctx.user, "提交复核", "计价批次", String(input.id), `${batch.title} ${batch.returnReason ? "退回后重新提交" : "已提交复核"}，等待独立复核`);
    return { ok: true };
  }),

  returnBatch: permittedQuery("batch:approve").input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(4).max(500) })).mutation(async ({ ctx, input }) => {
    const batch = await getBatch(input.id);
    assertBatchAction(batch, "return", ctx.user);
    const returnedAt = new Date();
    const [result] = await getDb().update(batches).set({
      status: "draft",
      returnReason: input.reason,
      returnedBy: ctx.user.id,
      returnedByName: ctx.user.name,
      returnedAt,
      submittedBy: null,
      submittedAt: null,
    }).where(and(eq(batches.id, input.id), eq(batches.status, "review")));
    if (!result.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "批次状态已变化，请刷新后再办理退回" });
    await log(ctx.user, "退回批次", "计价批次", String(input.id), `${batch.title} 退回修改：${input.reason}`);
    return { ok: true };
  }),

  approveBatch: permittedQuery("batch:approve").input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const batch = await getBatch(input.id);
    assertBatchAction(batch, "approve", ctx.user);
    const [result] = await getDb().update(batches).set({ status: "locked", approvedBy: ctx.user.id, approvedAt: new Date() }).where(and(eq(batches.id, input.id), eq(batches.status, "review")));
    if (!result.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "批次状态已变化，请刷新后再办理审批" });
    await log(ctx.user, "审批锁定", "计价批次", String(input.id), `${batch.title} 审批通过，结果明细与适用规则版本已锁定`);
    return { ok: true };
  }),
});
