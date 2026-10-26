import { evaluateFormula } from "./formula";

export type Category = "利润" | "规模" | "客户";
export type CalcMethod = "direct" | "stock_monthly" | "weighted_growth" | "quarterly_growth" | "custom";
export type AssessmentCycle = "月度" | "季度" | "年度" | "按批次";
export type RoundingMode = "四舍五入" | "向下取整" | "向上取整";

export type AssessmentPolicy = {
  cycle: AssessmentCycle;
  targetValue: number | null;
  weight: number | null;
  cap: number | null;
  floor: number | null;
  precision: number;
  rounding: RoundingMode;
  applicableOrgs: string;
  applicableRoles: string;
  attribution: "主办优先" | "按比例分润" | "机构归属";
  allowNegative: boolean;
  evidenceRequired: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  reviewFlow: "一级复核" | "两级复核";
  description: string;
  exclusions: string;
};

export type IndicatorDefinition = {
  id: string;
  name: string;
  category: Category;
  group: string;
  unit: "元/万元" | "元/户" | "元/笔";
  department: string;
  owner: string;
  description: string;
  sourceSystem: string;
  sourceCode: string;
  metricCode: string;
  sourceUnit: "元" | "万元" | "户" | "笔";
  unitFactor: number;
  method: CalcMethod;
  stockRate: number | null;
  positiveRate: number | null;
  negativeRate: number | null;
  formula: string;
  assessment: AssessmentPolicy;
};

export type IndicatorDesignStatus = "draft" | "review" | "published" | "archived";
export type IndicatorDesignRecord = {
  id: number;
  ruleId: string;
  name: string;
  status: IndicatorDesignStatus;
  baseVersion: number;
  definition: IndicatorDefinition;
  testSnapshot: Array<{ name: string; score: number; expression: string }> | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  publishedAt: Date | null;
};

export type PricingRule = {
  id: string;
  name: string;
  category: Category;
  group: string;
  unit: "元/万元" | "元/户" | "元/笔";
  stockRate: number | null;
  positiveRate: number | null;
  negativeRate: number | null;
  method: CalcMethod;
  sourceCode?: string;
  metricCode?: string;
  status: "active" | "review" | "disabled";
  note?: string;
  formula?: string;
  version?: number;
  definition?: IndicatorDefinition;
  updatedAt?: Date;
};

const r = (
  id: string,
  name: string,
  category: Category,
  group: string,
  stockRate: number | null,
  positiveRate: number | null,
  negativeRate: number | null,
  unit: PricingRule["unit"] = "元/万元",
  extra: Partial<PricingRule> = {},
): PricingRule => ({
  id,
  name,
  category,
  group,
  unit,
  stockRate,
  positiveRate,
  negativeRate,
  method: "direct",
  status: "active",
  ...extra,
});

// 完整转录自用户提供的《2026年全员全产品计价指标表》；M 码仅使用指标清单中明确提供的代码。
export const PRICING_RULES: PricingRule[] = [
  r("P001", "房贷净利息收入总量", "利润", "零贷净利息", 20, null, null, "元/万元", { method: "stock_monthly" }),
  r("P002", "非房贷款净利息收入总量", "利润", "零贷净利息", 80, null, null, "元/万元", { method: "stock_monthly" }),
  r("P003", "本外币对公贷款净利息收入", "利润", "公司净利息", 40, 200, 120, "元/万元", { method: "weighted_growth" }),
  r("P004", "普惠贷款净利息收入", "利润", "普惠净利息", 100, 350, 210, "元/万元", { method: "weighted_growth" }),
  r("P005", "本外币对公存款净利息收入", "利润", "公司净利息", 60, 300, 180, "元/万元", { method: "weighted_growth" }),
  r("P006", "同业负债净利息收入", "利润", "同业净利息", 60, 300, 180, "元/万元", { method: "weighted_growth" }),
  r("P007", "本外币对私存款净利息收入", "利润", "个金净利息", 60, 350, 210, "元/万元", { method: "weighted_growth", sourceCode: "M9991802", metricCode: "M9991801" }),
  r("P008", "趸缴保险", "利润", "零售财管中收", 500, null, null, "元/万元", { sourceCode: "M9992004", metricCode: "M9991971" }),
  r("P009", "交银人寿期缴", "利润", "零售财管中收", 720, null, null, "元/万元", { sourceCode: "M9992005", metricCode: "M9991972" }),
  r("P010", "非交银人寿期缴", "利润", "零售财管中收", 600, null, null, "元/万元", { sourceCode: "M9992006", metricCode: "M9991973" }),
  r("P011", "商业养老金保险", "利润", "零售财管中收", 500, null, null, "元/万元", { sourceCode: "M9991808", metricCode: "M9992088" }),
  r("P012", "基金（含专户）", "利润", "零售财管中收", 500, null, null, "元/万元", { sourceCode: "M9991809", metricCode: "M9992089" }),
  r("P013", "线上金", "利润", "贵金属", 300, null, null, "元/万元", { sourceCode: "M9992079", metricCode: "M9992081" }),
  r("P014", "实物金", "利润", "贵金属", 500, null, null, "元/万元", { sourceCode: "M9992078", metricCode: "M9992080" }),
  r("P015", "理财", "利润", "零售财管中收", 300, null, null, "元/万元", { sourceCode: "M9991812", metricCode: "M9992090" }),
  r("P016", "三年交银理财加配", "利润", "零售财管中收", 400, null, null, "元/万元", { sourceCode: "M9992074", metricCode: "M9992082" }),
  r("P017", "信托", "利润", "零售财管中收", 500, null, null, "元/万元", { sourceCode: "M9991813", metricCode: "M9992091" }),
  r("P018", "对公非息净收入－结算型", "利润", "公司中收", 300, null, null),
  r("P019", "对公非息净收入－非结算型", "利润", "公司中收", 150, null, null),
  r("P020", "信用卡车分期非息净收入总量", "利润", "信用卡", 150, null, null),
  r("S001", "普惠小微企业贷款时点净增线上", "规模", "普惠", null, 2.4, 1.44),
  r("S002", "普惠小微企业贷款时点净增线下", "规模", "普惠", null, 3, 1.8),
  r("S003", "普惠法人贷款日均净增", "规模", "普惠", null, 9, 5.4, "元/万元", { method: "weighted_growth" }),
  r("S004", "本外币对公存款日均", "规模", "公司存款", 0.1, 3.6, 2.16, "元/万元", { method: "weighted_growth" }),
  r("S005", "本外币对私存款日均", "规模", "个金存款", 0.1, 3.9, 2.34, "元/万元", { method: "weighted_growth", sourceCode: "M9992022", metricCode: "M9992016" }),
  r("S006", "财管AUM季日均增量", "规模", "个金存款", null, 2, 1.2, "元/万元", { method: "quarterly_growth", sourceCode: "M9992036", metricCode: "M9991975" }),
  r("S007", "房贷发放", "规模", "零贷", 5, null, null),
  r("S008", "个人经营性贷款净增", "规模", "零贷", null, 8, 4.8),
  r("S009", "个人消费贷款净增", "规模", "零贷", null, 8, 4.8),
  r("S010", "车金融投放－零贷", "规模", "零贷", 15, null, null),
  r("S011", "信用卡汽车分期投放", "规模", "信用卡", 15, null, null),
  r("C001", "源头代发个人客户净增", "客户", "公司客户", null, 30, 30, "元/户"),
  r("C002", "对公有效客户净增", "客户", "公司客户", null, 300, 300, "元/户"),
  r("C003", "跨境金融基础客户", "客户", "公司客户", 300, null, null, "元/户"),
  r("C004", "交行中型客户净增", "客户", "公司客户", null, 1200, 1200, "元/户"),
  r("C005", "交行大型客户净增", "客户", "公司客户", null, 1200, 1200, "元/户"),
  r("C006", "对公授信1000万以上客户净增", "客户", "公司客户", null, 1500, 1500, "元/户"),
  r("C007", "累计发薪量", "客户", "代发", 0.5, null, null, "元/万元", { sourceCode: "M9992010", metricCode: "M9992009" }),
  r("C008", "个人养老金净增缴费账户净增", "客户", "个金客户", null, 3, 3, "元/户", { sourceCode: "M9992075", metricCode: "M9992083" }),
  r("C009", "个人养老金满金账户净增", "客户", "个金客户", null, 80, 80, "元/户", { sourceCode: "M9992076", metricCode: "M9992085" }),
  r("C010", "中端客户净增（5万－50万）", "客户", "个金客户", null, 30, 30, "元/户", { sourceCode: "M9991704", metricCode: "M9991703" }),
  r("C011", "社保卡净增", "客户", "个金客户", null, 40, 40, "元/户", { sourceCode: "M9992008", metricCode: "M9992007" }),
  r("C012", "沃德客户净增", "客户", "个金客户", null, 200, 200, "元/户", { sourceCode: "M9991465", metricCode: "M9991464" }),
  r("C013", "私人银行客户净增", "客户", "个金客户", null, 2000, 2000, "元/户", { sourceCode: "M9991458", metricCode: "M9991457" }),
  r("C014", "家族信托净增", "客户", "个金客户", null, 3000, 3000, "元/户", { sourceCode: "M9992077", metricCode: "M9992087" }),
  r("C015", "信用卡活户净增", "客户", "信用卡", null, 55, 55, "元/户"),
  r("C016", "普惠小微贷款新投放客户（惠商贷、烟户贷）", "客户", "普惠客户", 90, null, null, "元/户"),
  r("C017", "普惠小微贷款新投放客户（其他个人贷款）", "客户", "普惠客户", 180, null, null, "元/户"),
  r("C018", "房贷（含公积金贷款）笔数", "客户", "零贷客户", 110, null, null, "元/笔"),
  r("C019", "普惠小微贷款客户净增（法人）", "客户", "普惠客户", null, 200, 200, "元/户"),
  r("C020", "首贷户新增", "客户", "普惠客户", 600, null, null, "元/户"),
];

export type CalcInput = {
  month: number;
  directValue: number;
  opening: number;
  current: number;
  previous: number;
  cap?: number | null;
  floor?: number | null;
};

export type CalcResult = {
  score: number;
  base: number;
  rate: number;
  expression: string;
  direction: "正向" | "扣减" | "零值";
};

export function calculate(rule: PricingRule, input: CalcInput): CalcResult {
  const n = Math.min(12, Math.max(1, Math.round(input.month || 1)));
  let base = input.directValue;
  let rate = rule.stockRate ?? 0;
  let expression = "";
  let additionalScore = 0;
  if (rule.method === "stock_monthly") {
    base = input.opening;
    rate = rule.stockRate ?? 0;
    expression = `${fmt(base)} ÷ 12 × ${fmt(rate)}`;
    base = base / 12;
  } else if (rule.method === "weighted_growth") {
    const yearGrowth = input.current - input.opening;
    const weighted = ((input.current - input.opening) * n) / 12 - ((input.previous - input.opening) * (n - 1)) / 12;
    rate = yearGrowth >= 0 ? (rule.positiveRate ?? 0) : (rule.negativeRate ?? 0);
    base = weighted;
    expression = `[(${fmt(input.current)}－${fmt(input.opening)})×${n}/12－(${fmt(input.previous)}－${fmt(input.opening)})×${n - 1}/12]×${fmt(rate)}`;
    if (rule.stockRate !== null) {
      additionalScore = (input.opening / 12) * rule.stockRate;
      expression = `${fmt(input.opening)}÷12×${fmt(rule.stockRate)}＋${expression}`;
    }
  } else if (rule.method === "quarterly_growth") {
    const growth = input.current - input.opening;
    rate = growth >= 0 ? (rule.positiveRate ?? 0) : (rule.negativeRate ?? 0);
    base = (input.current - input.previous) / 3;
    expression = `(${fmt(input.current)}－${fmt(input.previous)})÷3×${fmt(rate)}`;
  } else {
    rate = base >= 0 ? (rule.positiveRate ?? rule.stockRate ?? 0) : (rule.negativeRate ?? 0);
    expression = `${fmt(base)}×${fmt(rate)}`;
  }
  let score = base * rate + additionalScore;
  if (rule.formula) {
    const scope = {
      DIRECT: input.directValue,
      OPEN: input.opening,
      CUR: input.current,
      PREV: input.previous,
      MONTH: n,
      STOCK_RATE: rule.stockRate ?? 0,
      POS_RATE: rule.positiveRate ?? 0,
      NEG_RATE: rule.negativeRate ?? 0,
      UNIT_FACTOR: rule.definition?.unitFactor ?? 1,
    };
    score = evaluateFormula(rule.formula, scope);
    expression = `${rule.formula} ⇒ ${fmt(score)}`;
  }
  const assessment = rule.definition?.assessment;
  const cap = input.cap ?? assessment?.cap;
  const floor = input.floor ?? assessment?.floor;
  if (cap !== null && cap !== undefined) score = Math.min(score, cap);
  if (floor !== null && floor !== undefined) score = Math.max(score, floor);
  if (assessment && !assessment.allowNegative) score = Math.max(0, score);
  const precision = Math.min(6, Math.max(0, assessment?.precision ?? 2));
  const factor = 10 ** precision;
  if (assessment?.rounding === "向下取整") score = Math.floor(score * factor) / factor;
  else if (assessment?.rounding === "向上取整") score = Math.ceil(score * factor) / factor;
  else score = Math.sign(score) * Math.round((Math.abs(score) + Number.EPSILON) * factor) / factor;
  return { score, base, rate, expression, direction: score > 0 ? "正向" : score < 0 ? "扣减" : "零值" };
}

const fmt = (v: number) => Number(v.toFixed(4)).toLocaleString("zh-CN");

export const DEMO_EMPLOYEES = [
  { id: "E1027", name: "林书言", branch: "城东支行", role: "客户经理" },
  { id: "E1086", name: "周明远", branch: "城东支行", role: "理财经理" },
  { id: "E1162", name: "赵清和", branch: "高新支行", role: "普惠客户经理" },
  { id: "E1219", name: "陈嘉宁", branch: "营业部", role: "网点负责人" },
];

export const METHOD_LABELS: Record<CalcMethod, string> = {
  direct: "当月直接计价",
  stock_monthly: "存量逐月计提",
  weighted_growth: "时间加权增量",
  quarterly_growth: "季度日均折算",
  custom: "自定义公式",
};
