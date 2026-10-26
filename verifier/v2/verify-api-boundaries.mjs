import assert from "node:assert/strict";
import fs from "node:fs";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const command = "node verifier/v2/verify-api-boundaries.mjs";
const logPath = "verifier/runs/v2-api-boundaries.log";
const resultPath = "verifier/runs/v2-api-boundaries-result.json";
const startedAt = new Date().toISOString();
const client = createTRPCClient({
  links: [httpBatchLink({ url: "http://localhost:3000/api/trpc", transformer: superjson })],
});

function finish(result, exitCode) {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(result)}\nexit=${exitCode}\n`);
}

try {
  const before = await client.pricing.workspace.query();
  const source = before.rules.find((rule) => rule.id === "N003")?.definition;
  assert.ok(source, "缺少可复用的 N003 指标定义");
  const base = structuredClone(source);
  base.id = "B001";
  base.name = "生产边界只读验收";
  base.sourceUnit = "户";
  base.unit = "元/户";
  base.unitFactor = 1;
  base.method = "direct";
  base.assessment.cap = null;
  base.assessment.floor = null;
  base.assessment.allowNegative = true;

  const wrongUnit = structuredClone(base);
  wrongUnit.sourceUnit = "元";
  wrongUnit.unit = "元/万元";
  wrongUnit.unitFactor = 1;
  const wrongUnitResult = await client.pricing.testDesign.mutate({ definition: wrongUnit });
  assert.equal(wrongUnitResult.passed, false);
  assert.match(wrongUnitResult.validation.errors.join("；"), /必须为10000/);

  const noNegative = structuredClone(base);
  noNegative.assessment.allowNegative = false;
  noNegative.assessment.cap = -10;
  const noNegativeResult = await client.pricing.testDesign.mutate({ definition: noNegative });
  assert.equal(noNegativeResult.passed, true);
  assert.deepEqual(noNegativeResult.results.map((item) => item.score), [0, 0, 0, 0], "封顶不得绕过禁止负积分");

  const negativeRounding = structuredClone(base);
  negativeRounding.formula = "ROUND(-1.005, 2)";
  const roundingResult = await client.pricing.testDesign.mutate({ definition: negativeRounding });
  assert.equal(roundingResult.passed, true);
  assert.deepEqual(roundingResult.results.map((item) => item.score), [-1.01, -1.01, -1.01, -1.01]);

  const after = await client.pricing.workspace.query();
  for (const key of ["rules", "designs", "batches", "logs"]) {
    assert.equal(JSON.stringify(after[key]), JSON.stringify(before[key]), `只读边界验收不得改写 ${key}`);
  }

  const result = {
    status: "pass",
    mode: "testDesign only; no saved designs or batches",
    blocked: ["元转万元除数非10000"],
    noNegativeScores: noNegativeResult.results.map((item) => item.score),
    negativeRoundingScores: roundingResult.results.map((item) => item.score),
    workspaceUnchanged: true,
  };
  finish(result, 0);
  console.log(JSON.stringify(result));
} catch (error) {
  const result = { status: "fail", error: error instanceof Error ? error.stack : String(error) };
  finish(result, 1);
  console.error(result);
  process.exitCode = 1;
}
