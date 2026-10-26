import assert from "node:assert/strict";
import { calculate, PRICING_RULES, type IndicatorDefinition } from "../../contracts/pricing";
import { evaluateFormula, validateFormula } from "../../contracts/formula";
import { definitionFromRule, definitionToRule, emptyIndicator, formulaForMethod, testIndicator, validateIndicator } from "../../contracts/indicator";

const scope = { DIRECT: 128, OPEN: 8600, CUR: 9320, PREV: 9150, MONTH: 10, STOCK_RATE: 0.1, POS_RATE: 25, NEG_RATE: 15, UNIT_FACTOR: 1 };
assert.equal(evaluateFormula("DIRECT / UNIT_FACTOR * POS_RATE", scope), 3200);
assert.equal(evaluateFormula("IF(DIRECT > 0, POS_RATE, 1 / 0)", scope), 25, "IF 必须惰性计算未命中分支");
assert.equal(evaluateFormula("DIRECT > 0 ? POS_RATE : 1 / 0", scope), 25, "条件表达式必须惰性计算");
assert.equal(evaluateFormula("MIN(8, 3, 5) + MAX(2, 4) + ROUND(1.2345, 2) + ABS(-2)", scope), 10.23);
assert.equal(evaluateFormula("ROUND(-1.005, 2)", scope), -1.01, "负数临界点必须按 half-up 舍入");
assert.equal(validateFormula("DIRECT * UNKNOWN").valid, false);
assert.match(validateFormula("DIRECT.constructor").errors.join("；"), /MemberExpression|未知变量/);
assert.equal(validateFormula("globalThis.process").valid, false);
assert.equal(validateFormula("DIRECT = 3").valid, false);
assert.equal(validateFormula("[DIRECT, OPEN]").valid, false);
assert.throws(() => evaluateFormula("DIRECT / (CUR - CUR)", scope), /除零/);
assert.throws(() => evaluateFormula("1e309", scope), /有限数值/);

function validDefinition(id = "T001"): IndicatorDefinition {
  const definition = emptyIndicator(id);
  Object.assign(definition, {
    name: "引擎验收有效客户净增",
    category: "客户",
    group: "设计演练",
    unit: "元/户",
    description: "仅用于公式与生命周期验收，不属于年度权威计价指标。",
    sourceCode: "M9100001",
    metricCode: "M9100002",
    sourceUnit: "户",
    unitFactor: 1,
    stockRate: null,
    positiveRate: 25,
    negativeRate: 15,
  });
  definition.formula = formulaForMethod("direct");
  definition.assessment.description = "按当月净增户数计价，经机构复核和部门确认后计入对应考核期间。";
  return definition;
}

const direct = validDefinition();
assert.deepEqual(validateIndicator(direct).errors, []);
const tested = testIndicator(direct);
assert.equal(tested.passed, true);
assert.deepEqual(tested.results.map((item) => item.score), [3200, -630, 0, 250]);

const missingUnit = { ...direct, sourceUnit: "元" as const, unitFactor: 10000, formula: "DIRECT * POS_RATE" };
assert.match(validateIndicator(missingUnit).errors.join("；"), /金额放大一万倍/);
const wrongUnitFactor = { ...direct, sourceUnit: "元" as const, unit: "元/万元" as const, unitFactor: 1 };
assert.match(validateIndicator(wrongUnitFactor).errors.join("；"), /必须为10000/);
const staleMonth = { ...direct, method: "weighted_growth" as const, formula: "(CUR - OPEN) * POS_RATE / UNIT_FACTOR" };
assert.match(validateIndicator(staleMonth).errors.join("；"), /必须引用 MONTH/);
const badCap = { ...direct, assessment: { ...direct.assessment, cap: 10, floor: 20 } };
assert.match(validateIndicator(badCap).errors.join("；"), /封顶不能小于积分保底/);
const badDates = { ...direct, assessment: { ...direct.assessment, effectiveFrom: "2026-12-31", effectiveTo: "2026-01-01" } };
assert.match(validateIndicator(badDates).errors.join("；"), /失效日期不能早于生效日期/);

const noNegative = { ...direct, assessment: { ...direct.assessment, allowNegative: false } };
assert.equal(calculate(definitionToRule(noNegative), { month: 10, directValue: -42, opening: 0, current: 0, previous: 0 }).score, 0);
const noNegativeWithCap = { ...noNegative, assessment: { ...noNegative.assessment, cap: -10 } };
assert.equal(calculate(definitionToRule(noNegativeWithCap), { month: 10, directValue: -42, opening: 0, current: 0, previous: 0 }).score, 0, "封顶不得绕过禁止负积分");
const negativeRounding = { ...direct, negativeRate: 1.005 };
assert.equal(calculate(definitionToRule(negativeRounding), { month: 10, directValue: -1, opening: 0, current: 0, previous: 0 }).score, -1.01);
const capped = { ...direct, assessment: { ...direct.assessment, cap: 100, floor: -100, precision: 1, rounding: "向上取整" as const } };
assert.equal(calculate(definitionToRule(capped), { month: 10, directValue: 128, opening: 0, current: 0, previous: 0 }).score, 100);
const rounded = { ...direct, positiveRate: 0.1234, assessment: { ...direct.assessment, precision: 1, rounding: "向上取整" as const } };
assert.equal(calculate(definitionToRule(rounded), { month: 10, directValue: 1, opening: 0, current: 0, previous: 0 }).score, 0.2);

for (const method of ["direct", "stock_monthly", "weighted_growth", "quarterly_growth", "custom"] as const) {
  const definition = { ...direct, method, stockRate: 2, sourceUnit: "万元" as const, unit: "元/万元" as const, formula: formulaForMethod(method, true) };
  const result = testIndicator(definition);
  assert.equal(result.passed, true, `${method} 四组场景必须通过：${JSON.stringify(result.results)}`);
  assert.equal(result.results.length, 4);
}

const input = { month: 10, directValue: 128, opening: 8600, current: 9320, previous: 9150 };
for (const id of ["P001", "P008", "S005", "S006", "C013"]) {
  const original = PRICING_RULES.find((rule) => rule.id === id)!;
  const explicit = definitionToRule(definitionFromRule(original));
  assert.equal(calculate(explicit, input).score, calculate(original, input).score, `${id} 显式公式不得改变预置算法结果`);
}

console.log(JSON.stringify({
  status: "pass",
  assertions: "公式白名单、惰性分支、除零、非有限值、单位、月份、考核边界、五种算法、四组场景、预置算法一致性",
  standardScores: tested.results.map((item) => item.score),
  presetRules: PRICING_RULES.length,
}));
