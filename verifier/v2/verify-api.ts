import assert from "node:assert/strict";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import { definitionFromRule, emptyIndicator, formulaForMethod } from "../../contracts/indicator";
import { PRICING_RULES, type IndicatorDefinition } from "../../contracts/pricing";

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "http://localhost:3000/api/trpc", transformer: superjson })] });
async function expectReject(action: () => Promise<unknown>, pattern: RegExp, label: string) {
  try { await action(); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, pattern, `${label} 错误信息不符合预期`);
    return message;
  }
  throw new Error(`${label} 未被服务端阻断`);
}
function definition(id: string): IndicatorDefinition {
  const value = emptyIndicator(id);
  Object.assign(value, {
    name: "接口验收演练指标", category: "客户", group: "设计演练", unit: "元/户",
    description: "仅用于服务端阻断与归档验收，不进入正式指标库。",
    sourceCode: "M9200001", metricCode: "M9200002", sourceUnit: "户", unitFactor: 1,
    stockRate: null, positiveRate: 25, negativeRate: 15,
  });
  value.formula = formulaForMethod("direct");
  value.assessment.description = "仅用于接口验收；提交与发布必须由服务端重新检查并阻断异常配置。";
  return value;
}

const before = await client.pricing.workspace.query();
assert.ok(before.rules.length >= 51);
const batchFingerprint = JSON.stringify(before.batches);
const baseRule = PRICING_RULES.find((rule) => rule.id === before.rules[0].id)!;
const malicious = definition("T901");
malicious.formula = "DIRECT.constructor";
const unsafe = await client.pricing.testDesign.mutate({ definition: malicious });
assert.equal(unsafe.passed, false);
assert.match(unsafe.validation.errors.join("；"), /MemberExpression|未知变量/);

await expectReject(() => client.pricing.saveDesign.mutate({ baseVersion: 0, definition: definitionFromRule(baseRule) }), /已存在/, "重复正式编码");
await expectReject(() => client.pricing.saveDesign.mutate({ baseVersion: before.rules[0].version + 1, definition: definitionFromRule(baseRule) }), /已更新为V|重新设计/, "过期基础版本");

const suffix = Date.now().toString().slice(-8);
const unitId = `V${suffix}`;
const unit = definition(unitId);
unit.sourceUnit = "元";
unit.unitFactor = 10000;
unit.formula = "DIRECT * POS_RATE";
const unitDraft = await client.pricing.saveDesign.mutate({ baseVersion: 0, definition: unit });
assert.equal(unitDraft.status, "draft");
await expectReject(() => client.pricing.publishDesign.mutate({ id: unitDraft.id }), /仅待复核状态可发布/, "草稿直接发布");
await expectReject(() => client.pricing.submitDesign.mutate({ id: unitDraft.id }), /金额放大一万倍/, "缺少单位换算");
await client.pricing.archiveDesign.mutate({ id: unitDraft.id });
await expectReject(() => client.pricing.saveDesign.mutate({ designId: unitDraft.id, baseVersion: 0, definition: unit }), /不可直接修改/, "修改已归档设计");

const zeroId = `W${suffix}`;
const zero = definition(zeroId);
zero.sourceUnit = "元";
zero.unitFactor = 10000;
zero.formula = "DIRECT / (CUR - CUR) * POS_RATE / UNIT_FACTOR";
const zeroDraft = await client.pricing.saveDesign.mutate({ baseVersion: 0, definition: zero });
await expectReject(() => client.pricing.saveDesign.mutate({ baseVersion: 0, definition: zero }), /已有未发布设计稿/, "重复未发布设计");
await expectReject(() => client.pricing.submitDesign.mutate({ id: zeroDraft.id }), /发布前测试未通过.*除零/, "除零公式提交");
await client.pricing.archiveDesign.mutate({ id: zeroDraft.id });

const after = await client.pricing.workspace.query();
assert.equal(JSON.stringify(after.batches), batchFingerprint, "异常设计验收不得改写任何试算批次");
for (const id of [unitId, zeroId]) {
  assert.equal(after.rules.some((rule) => rule.id === id), false, `${id} 不得进入正式规则`);
  const design = after.designs.find((item) => item.ruleId === id);
  assert.equal(design?.status, "archived");
}
console.log(JSON.stringify({ status: "pass", workspaceRules: after.rules.length, blocked: ["重复编码", "过期版本", "草稿直接发布", "缺少单位换算", "修改已归档设计", "重复未发布设计", "除零提交"], archived: [unitId, zeroId], batchesUnchanged: true }));
