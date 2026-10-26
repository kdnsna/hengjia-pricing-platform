import { calculate, type CalcInput, type CalcMethod, type IndicatorDefinition, type PricingRule } from "./pricing";
import { validateFormula } from "./formula";

export type IndicatorValidation = { errors: string[]; warnings: string[]; variables: string[] };
export type IndicatorTestResult = {
  name: "正向场景" | "负向场景" | "零值边界" | "一月进度";
  passed: boolean;
  score: number | null;
  expression: string;
  error?: string;
};

export const TEST_INPUTS: Array<{ name: IndicatorTestResult["name"]; input: CalcInput }> = [
  { name: "正向场景", input: { month: 10, directValue: 128, opening: 8600, current: 9320, previous: 9150 } },
  { name: "负向场景", input: { month: 10, directValue: -42, opening: 8600, current: 8300, previous: 8420 } },
  { name: "零值边界", input: { month: 10, directValue: 0, opening: 8600, current: 8600, previous: 8600 } },
  { name: "一月进度", input: { month: 1, directValue: 10, opening: 0, current: 100, previous: 0 } },
];

export function formulaForMethod(method: CalcMethod, includeStock = false): string {
  const growthRate = "IF(CUR >= OPEN, POS_RATE, NEG_RATE)";
  if (method === "stock_monthly") return "OPEN / UNIT_FACTOR / 12 * STOCK_RATE";
  if (method === "weighted_growth") {
    const stock = includeStock ? "OPEN / UNIT_FACTOR / 12 * STOCK_RATE + " : "";
    return `${stock}(((CUR - OPEN) / UNIT_FACTOR * MONTH / 12) - ((PREV - OPEN) / UNIT_FACTOR * (MONTH - 1) / 12)) * ${growthRate}`;
  }
  if (method === "quarterly_growth") return `(CUR - PREV) / UNIT_FACTOR / 3 * ${growthRate}`;
  if (method === "custom") return "DIRECT / UNIT_FACTOR * POS_RATE";
  return "DIRECT / UNIT_FACTOR * IF(DIRECT > 0, IF(POS_RATE > 0, POS_RATE, STOCK_RATE), IF(DIRECT < 0, NEG_RATE, 0))";
}

export function emptyIndicator(id = "N001"): IndicatorDefinition {
  const definition: IndicatorDefinition = {
    id,
    name: "",
    category: "利润",
    group: "零售财管中收",
    unit: "元/万元",
    department: "个人金融业务部",
    owner: "计价管理员",
    description: "",
    sourceSystem: "源系统科目 / 部件指标",
    sourceCode: "",
    metricCode: "",
    sourceUnit: "万元",
    unitFactor: 1,
    method: "direct",
    stockRate: 300,
    positiveRate: null,
    negativeRate: null,
    formula: "",
    assessment: {
      cycle: "月度",
      targetValue: null,
      weight: null,
      cap: null,
      floor: null,
      precision: 2,
      rounding: "四舍五入",
      applicableOrgs: "全辖经营机构",
      applicableRoles: "客户经理、理财经理、网点负责人",
      attribution: "按比例分润",
      allowNegative: true,
      evidenceRequired: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      reviewFlow: "一级复核",
      description: "",
      exclusions: "冲正业务按原期间追溯；重复、无效及测试数据不计价。",
    },
  };
  definition.formula = formulaForMethod(definition.method, true);
  return definition;
}

export function definitionFromRule(rule: PricingRule): IndicatorDefinition {
  if (rule.definition) return JSON.parse(JSON.stringify(rule.definition)) as IndicatorDefinition;
  const definition = emptyIndicator(rule.id);
  const sourceUnit = rule.unit === "元/户" ? "户" : rule.unit === "元/笔" ? "笔" : "万元";
  return {
    ...definition,
    name: rule.name,
    category: rule.category,
    group: rule.group,
    unit: rule.unit,
    description: rule.note ?? `依据2026年度全员全产品计价标准维护${rule.name}的取数、计价与考核口径。`,
    sourceCode: rule.sourceCode ?? "",
    metricCode: rule.metricCode ?? "",
    sourceUnit,
    method: rule.method,
    stockRate: rule.stockRate,
    positiveRate: rule.positiveRate,
    negativeRate: rule.negativeRate,
    formula: rule.formula ?? formulaForMethod(rule.method, rule.stockRate !== null),
    assessment: {
      ...definition.assessment,
      description: "按年度全员全产品计价标准执行；数据经取数核对、试算复核后计入对应考核期间。",
    },
  };
}

export function definitionToRule(definition: IndicatorDefinition, version = 1): PricingRule {
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    group: definition.group,
    unit: definition.unit,
    stockRate: definition.stockRate,
    positiveRate: definition.positiveRate,
    negativeRate: definition.negativeRate,
    method: definition.method,
    sourceCode: definition.sourceCode || undefined,
    metricCode: definition.metricCode || undefined,
    status: "active",
    note: definition.description,
    formula: definition.formula,
    version,
    definition,
  };
}

export function validateIndicator(definition: IndicatorDefinition): IndicatorValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(definition.id)) errors.push("指标编码须为3—32位大写字母、数字或下划线，并以字母开头");
  if (!definition.name.trim()) errors.push("指标名称不能为空");
  if (!definition.group.trim()) errors.push("指标分组不能为空");
  if (!definition.department.trim() || !definition.owner.trim()) errors.push("责任部门与责任人不能为空");
  if (!Number.isFinite(definition.unitFactor) || definition.unitFactor <= 0) errors.push("单位换算除数必须大于0");
  if (definition.sourceUnit === "元" && definition.unit === "元/万元" && definition.unitFactor !== 10000) errors.push("源数据为元且按万元计价时，单位换算除数必须为10000");
  [definition.stockRate, definition.positiveRate, definition.negativeRate].forEach((rate) => {
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) errors.push("计价单价必须为不小于0的数值");
  });
  const formula = validateFormula(definition.formula);
  errors.push(...formula.errors);
  if (definition.sourceUnit === "元" && !formula.variables.includes("UNIT_FACTOR") && !definition.formula.includes("/10000") && !definition.formula.includes("/ 10000")) {
    errors.push("源数据单位为元，公式必须使用 UNIT_FACTOR 或显式除以10000，防止金额放大一万倍");
  }
  if (definition.method === "weighted_growth" && !formula.variables.includes("MONTH")) errors.push("时间加权增量公式必须引用 MONTH，不能残留固定月份参数");
  if (definition.method === "direct" && !formula.variables.includes("DIRECT")) warnings.push("当月直接计价公式未引用 DIRECT，请确认是否应为固定积分或其他口径");
  if (definition.positiveRate !== null && definition.negativeRate !== null && definition.negativeRate > definition.positiveRate) warnings.push("负增扣减单价高于正增单价，请核对制度依据");
  if (definition.sourceCode && definition.metricCode && definition.sourceCode === definition.metricCode) warnings.push("取数M码与积分M码相同，请确认是否发生抄串");
  if (Boolean(definition.sourceCode) !== Boolean(definition.metricCode)) warnings.push("取数M码与积分M码仅填写一项，关联链路尚不完整");
  const { assessment } = definition;
  if (!assessment.applicableOrgs.trim() || !assessment.applicableRoles.trim()) errors.push("适用机构与适用岗位不能为空");
  if (!assessment.effectiveFrom || !assessment.effectiveTo) errors.push("生效起止日期不能为空");
  if (assessment.effectiveFrom && assessment.effectiveTo && assessment.effectiveTo < assessment.effectiveFrom) errors.push("失效日期不能早于生效日期");
  if (assessment.cap !== null && assessment.floor !== null && assessment.cap < assessment.floor) errors.push("积分封顶不能小于积分保底");
  if (assessment.weight !== null && (assessment.weight < 0 || assessment.weight > 100)) errors.push("考核权重须在0—100之间");
  if (assessment.description.trim().length < 10) errors.push("考核细则至少填写10个字，说明计提、复核和入账要求");
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], variables: formula.variables };
}

export function testIndicator(definition: IndicatorDefinition): { passed: boolean; results: IndicatorTestResult[] } {
  const validation = validateIndicator(definition);
  const rule = definitionToRule(definition);
  const results = TEST_INPUTS.map(({ name, input }) => {
    try {
      const result = calculate(rule, input);
      if (!Number.isFinite(result.score)) throw new Error("结果不是有限数值");
      return { name, passed: true, score: result.score, expression: result.expression };
    } catch (error) {
      return { name, passed: false, score: null, expression: "", error: error instanceof Error ? error.message : "试算失败" };
    }
  });
  return { passed: validation.errors.length === 0 && results.every((result) => result.passed), results };
}
