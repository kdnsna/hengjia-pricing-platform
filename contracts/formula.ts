import jsep from "jsep";

export type FormulaValue = number | boolean;
export type FormulaScope = Record<string, number>;
export type FormulaValidation = { valid: boolean; errors: string[]; variables: string[] };

type AstNode = { type: string; [key: string]: unknown };

export const FORMULA_VARIABLES = [
  { code: "DIRECT", label: "当月业务值", detail: "当月新增、净增或直接计价业务量" },
  { code: "OPEN", label: "年初值", detail: "年初余额或期初口径" },
  { code: "CUR", label: "当月值", detail: "当月期末余额或累计值" },
  { code: "PREV", label: "上月值", detail: "上月同口径期末值" },
  { code: "MONTH", label: "月份 n", detail: "1—12，由计价期间自动注入" },
  { code: "STOCK_RATE", label: "存量 / 总量单价", detail: "年度标准中的存量或总量单价" },
  { code: "POS_RATE", label: "正增单价", detail: "正向增长适用单价" },
  { code: "NEG_RATE", label: "负增单价", detail: "负增长扣减单价，配置为正数" },
  { code: "UNIT_FACTOR", label: "单位换算除数", detail: "元转万元为10000，其余通常为1" },
] as const;

const VARIABLE_NAMES = new Set<string>(FORMULA_VARIABLES.map((v) => v.code));
const FUNCTIONS = new Set(["IF", "MIN", "MAX", "ROUND", "ABS"]);
const BINARY_OPERATORS = new Set(["+", "-", "*", "/", "%", ">", ">=", "<", "<=", "==", "===", "!=", "!==", "&&", "||"]);
const UNARY_OPERATORS = new Set(["+", "-", "!"]);

function asNode(value: unknown): AstNode {
  return value as AstNode;
}

function walk(node: AstNode, visit: (node: AstNode) => void, count = { value: 0 }) {
  count.value += 1;
  if (count.value > 300) throw new Error("公式节点超过300个，请拆分为更简单的计算口径");
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "type") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item && typeof item === "object" && "type" in item) walk(asNode(item), visit, count);
      });
    } else if (value && typeof value === "object" && "type" in value) {
      walk(asNode(value), visit, count);
    }
  }
}

export function parseFormula(formula: string): AstNode {
  if (!formula.trim()) throw new Error("公式不能为空");
  if (formula.length > 2000) throw new Error("公式不能超过2000个字符");
  return asNode(jsep(formula));
}

export function validateFormula(formula: string): FormulaValidation {
  const errors: string[] = [];
  const variables = new Set<string>();
  try {
    const ast = parseFormula(formula);
    walk(ast, (node) => {
      if (node.type === "Identifier") {
        const name = String(node.name);
        if (!VARIABLE_NAMES.has(name) && !FUNCTIONS.has(name)) errors.push(`未知变量或函数：${name}`);
        if (VARIABLE_NAMES.has(name)) variables.add(name);
      } else if (node.type === "CallExpression") {
        const callee = asNode(node.callee);
        if (callee.type !== "Identifier" || !FUNCTIONS.has(String(callee.name))) errors.push("仅允许调用 IF、MIN、MAX、ROUND、ABS 白名单函数");
      } else if (node.type === "BinaryExpression" || node.type === "LogicalExpression") {
        if (!BINARY_OPERATORS.has(String(node.operator))) errors.push(`不支持的运算符：${String(node.operator)}`);
      } else if (node.type === "UnaryExpression") {
        if (!UNARY_OPERATORS.has(String(node.operator))) errors.push(`不支持的一元运算符：${String(node.operator)}`);
      } else if (["MemberExpression", "ThisExpression", "ArrayExpression", "Compound", "SequenceExpression", "AssignmentExpression"].includes(node.type)) {
        errors.push(`禁止的公式结构：${node.type}`);
      } else if (!["Literal", "ConditionalExpression"].includes(node.type) && !["Identifier", "CallExpression", "BinaryExpression", "UnaryExpression"].includes(node.type)) {
        errors.push(`不支持的公式节点：${node.type}`);
      }
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "公式语法无法解析");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], variables: [...variables] };
}

function numberValue(value: FormulaValue, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label}必须为有限数值`);
  return value;
}

function evalNode(node: AstNode, scope: FormulaScope): FormulaValue {
  switch (node.type) {
    case "Literal": {
      if (typeof node.value !== "number" && typeof node.value !== "boolean") throw new Error("公式常量仅允许数值和布尔值");
      return node.value;
    }
    case "Identifier": {
      const name = String(node.name);
      if (!VARIABLE_NAMES.has(name) || !Object.hasOwn(scope, name)) throw new Error(`未提供变量：${name}`);
      return numberValue(scope[name], name);
    }
    case "UnaryExpression": {
      const operator = String(node.operator);
      if (!UNARY_OPERATORS.has(operator)) throw new Error(`不支持的一元运算符：${operator}`);
      const value = evalNode(asNode(node.argument), scope);
      if (operator === "!") return !value;
      const n = numberValue(value, "一元运算值");
      return operator === "-" ? -n : n;
    }
    case "ConditionalExpression": {
      return evalNode(asNode(node.test), scope)
        ? evalNode(asNode(node.consequent), scope)
        : evalNode(asNode(node.alternate), scope);
    }
    case "BinaryExpression":
    case "LogicalExpression": {
      const operator = String(node.operator);
      if (!BINARY_OPERATORS.has(operator)) throw new Error(`不支持的运算符：${operator}`);
      const left = evalNode(asNode(node.left), scope);
      if (operator === "&&") return left ? evalNode(asNode(node.right), scope) : false;
      if (operator === "||") return left ? true : evalNode(asNode(node.right), scope);
      const right = evalNode(asNode(node.right), scope);
      if ([">", ">=", "<", "<=", "==", "===", "!=", "!=="].includes(operator)) {
        if (operator === ">") return left > right;
        if (operator === ">=") return left >= right;
        if (operator === "<") return left < right;
        if (operator === "<=") return left <= right;
        if (operator === "==" || operator === "===") return left === right;
        return left !== right;
      }
      const a = numberValue(left, "左操作数");
      const b = numberValue(right, "右操作数");
      if ((operator === "/" || operator === "%") && b === 0) throw new Error("公式出现除零");
      const result = operator === "+" ? a + b : operator === "-" ? a - b : operator === "*" ? a * b : operator === "/" ? a / b : a % b;
      return numberValue(result, "运算结果");
    }
    case "CallExpression": {
      const callee = asNode(node.callee);
      if (callee.type !== "Identifier") throw new Error("禁止对象属性或动态函数调用");
      const name = String(callee.name);
      if (!FUNCTIONS.has(name)) throw new Error(`不允许调用函数：${name}`);
      const args = (node.arguments as unknown[]).map(asNode);
      if (name === "IF") {
        if (args.length !== 3) throw new Error("IF 必须包含条件、成立结果、不成立结果三个参数");
        return evalNode(args[0], scope) ? evalNode(args[1], scope) : evalNode(args[2], scope);
      }
      const values = args.map((arg) => numberValue(evalNode(arg, scope), `${name} 参数`));
      if ((name === "MIN" || name === "MAX") && values.length < 1) throw new Error(`${name} 至少需要一个参数`);
      if (name === "ROUND") {
        if (values.length < 1 || values.length > 2) throw new Error("ROUND 需要一个数值和可选小数位数");
        const digits = values.length === 2 ? Math.min(6, Math.max(0, Math.round(values[1]))) : 0;
        const factor = 10 ** digits;
        return Math.sign(values[0]) * Math.round((Math.abs(values[0]) + Number.EPSILON) * factor) / factor;
      }
      if (name === "ABS" && values.length !== 1) throw new Error("ABS 仅接受一个参数");
      if (name === "MIN") return Math.min(...values);
      if (name === "MAX") return Math.max(...values);
      return Math.abs(values[0]);
    }
    default:
      throw new Error(`禁止或不支持的公式结构：${node.type}`);
  }
}

export function evaluateFormula(formula: string, scope: FormulaScope): number {
  const validation = validateFormula(formula);
  if (!validation.valid) throw new Error(validation.errors.join("；"));
  return numberValue(evalNode(parseFormula(formula), scope), "公式结果");
}
