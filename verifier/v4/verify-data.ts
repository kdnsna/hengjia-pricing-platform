import assert from "node:assert/strict";
import fs from "node:fs";
import { getDb } from "../../api/queries/connection";
import { allocations, appUsers, auditLogs, authSessions, batches, indicatorDesigns, pricingRules } from "../../db/schema";
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD } from "../../contracts/access";
import { PRICING_RULES } from "../../contracts/pricing";

const command = "node_modules/.bin/tsx verifier/v4/verify-data.ts";
const startedAt = new Date().toISOString();
const logPath = "verifier/runs/v4-data.log";
const resultPath = "verifier/runs/v4-data-result.json";
let exitCode = 0;
let result: Record<string, unknown>;

function duplicateValues(values: Array<string | number>) {
  const counts = new Map<string | number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

try {
  const db = getDb();
  const [rules, designs, shares, batchRows, users, sessions, logs] = await Promise.all([
    db.select().from(pricingRules),
    db.select().from(indicatorDesigns),
    db.select().from(allocations),
    db.select().from(batches),
    db.select().from(appUsers),
    db.select().from(authSessions),
    db.select().from(auditLogs),
  ]);

  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  for (const expected of PRICING_RULES) {
    const actual = rulesById.get(expected.id);
    assert.ok(actual, `缺少年度正式指标 ${expected.id}`);
    assert.equal(actual.status, "active", `${expected.id} 应保持启用`);
    assert.equal(actual.name, expected.name, `${expected.id} 名称被改变`);
    assert.equal(actual.category, expected.category, `${expected.id} 分类被改变`);
    assert.equal(actual.groupName, expected.group, `${expected.id} 分组被改变`);
    assert.equal(actual.unit, expected.unit, `${expected.id} 单位被改变`);
    assert.equal(actual.method, expected.method, `${expected.id} 算法被改变`);
    assert.equal(actual.stockRate, expected.stockRate, `${expected.id} 存量单价被改变`);
    assert.equal(actual.positiveRate, expected.positiveRate, `${expected.id} 正增单价被改变`);
    assert.equal(actual.negativeRate, expected.negativeRate, `${expected.id} 负增单价被改变`);
    assert.equal(actual.sourceCode ?? null, expected.sourceCode ?? null, `${expected.id} 取数M码被改变`);
    assert.equal(actual.metricCode ?? null, expected.metricCode ?? null, `${expected.id} 积分M码被改变`);
  }

  for (const expected of DEMO_ACCOUNTS) {
    const actual = users.find((user) => user.username === expected.username);
    assert.ok(actual, `缺少演示账号 ${expected.username}`);
    assert.equal(actual.status, "active");
    assert.equal(actual.employeeId, expected.employeeId);
    assert.equal(actual.name, expected.name);
    assert.equal(actual.role, expected.role);
    assert.equal(actual.branch, expected.branch);
    assert.equal(actual.position, expected.position);
  }
  for (const user of users) {
    assert.match(user.passwordHash, /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/, `${user.username} 密码哈希格式不符`);
    assert.equal(user.passwordHash.includes(DEMO_ACCOUNT_PASSWORD), false, "密码明文不得写入哈希字段");
  }

  assert.deepEqual(duplicateValues(rules.map((row) => row.id)), [], "规则ID存在重复");
  assert.deepEqual(duplicateValues(designs.map((row) => row.id)), [], "设计稿ID存在重复");
  assert.deepEqual(duplicateValues(shares.map((row) => row.id)), [], "分润ID存在重复");
  assert.deepEqual(duplicateValues(batchRows.map((row) => row.id)), [], "批次ID存在重复");
  assert.deepEqual(duplicateValues(logs.map((row) => row.id)), [], "日志ID存在重复");
  assert.deepEqual(duplicateValues(sessions.map((row) => row.id)), [], "会话ID存在重复");
  assert.deepEqual(duplicateValues(sessions.map((row) => row.tokenHash)), [], "会话令牌哈希存在重复");
  assert.deepEqual(duplicateValues(users.map((row) => row.id)), [], "账号ID存在重复");
  assert.deepEqual(duplicateValues(users.map((row) => row.username)), [], "登录名存在重复");
  assert.deepEqual(duplicateValues(users.map((row) => row.employeeId)), [], "员工编号存在重复");

  const accessResult = JSON.parse(fs.readFileSync("verifier/runs/v4-access-result.json", "utf8")) as {
    status: string;
    testArtifacts: { ruleId: string; designId: number; branchBatchId: number; separationBatchId: number; createdUserIds: number[] };
  };
  assert.equal(accessResult.status, "pass");
  const artifacts = accessResult.testArtifacts;
  const retainedRule = rulesById.get(artifacts.ruleId);
  assert.equal(retainedRule?.status, "disabled", "测试规则应停用并保留");
  const retainedDesign = designs.find((row) => row.id === artifacts.designId);
  assert.equal(retainedDesign?.status, "published", "测试设计稿应保留发布记录");
  for (const id of [artifacts.branchBatchId, artifacts.separationBatchId]) {
    const retainedBatch = batchRows.find((row) => row.id === id);
    assert.equal(retainedBatch?.status, "locked", `测试批次 ${id} 应保留锁定记录`);
    assert.ok(Array.isArray(retainedBatch?.resultSnapshot), `测试批次 ${id} 应保留结果快照`);
  }
  const retainedTestUsers = users.filter((row) => artifacts.createdUserIds.includes(row.id));
  assert.equal(retainedTestUsers.length, artifacts.createdUserIds.length);
  assert.ok(retainedTestUsers.every((row) => row.status === "disabled"), "测试账号应全部停用");
  assert.equal(sessions.some((row) => artifacts.createdUserIds.includes(row.userId)), false, "测试账号会话应全部注销");

  const snapshot = JSON.parse(fs.readFileSync("verifier/runs/v4-introspected-after/meta/0000_snapshot.json", "utf8")) as {
    tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }>;
  };
  const expectedTables = ["allocations", "app_users", "audit_logs", "auth_sessions", "calculation_batches", "indicator_designs", "pricing_rules"];
  assert.deepEqual(Object.keys(snapshot.tables).sort(), expectedTables.sort());
  assert.equal(Object.values(snapshot.tables).reduce((sum, table) => sum + Object.keys(table.columns).length, 0), 84);
  const indexNames = Object.values(snapshot.tables).flatMap((table) => Object.keys(table.indexes)).sort();
  assert.deepEqual(indexNames, [
    "app_users_branch_idx", "app_users_employee_id_unique", "app_users_role_idx", "app_users_username_unique",
    "auth_sessions_expiry_idx", "auth_sessions_token_hash_unique", "auth_sessions_user_idx", "indicator_rule_idx", "indicator_status_idx",
  ].sort());
  const constraintResult = JSON.parse(fs.readFileSync("verifier/runs/v4-constraints-result.json", "utf8")) as { status: string; checkCount: number; transactionsRolledBack: boolean };
  assert.equal(constraintResult.status, "pass");
  assert.equal(constraintResult.checkCount, 10);
  assert.equal(constraintResult.transactionsRolledBack, true);

  result = {
    status: "pass",
    startedAt,
    finishedAt: new Date().toISOString(),
    originalRulesVerified: PRICING_RULES.length,
    demoAccountsVerified: DEMO_ACCOUNTS.length,
    rowCounts: { rules: rules.length, designs: designs.length, allocations: shares.length, batches: batchRows.length, users: users.length, sessions: sessions.length, logs: logs.length },
    duplicateChecks: "pass",
    testArtifactsRetained: true,
    introspection: {
      tables: expectedTables.length,
      columns: 84,
      indexes: indexNames.length,
      note: "introspection未正确标识既有主键和唯一性；10组事务重复值测试已由数据库实际拒绝并全部回滚",
    },
    constraintChecks: constraintResult.checkCount,
  };
} catch (error) {
  exitCode = 1;
  result = { status: "fail", startedAt, finishedAt: new Date().toISOString(), error: error instanceof Error ? error.stack : String(error) };
} finally {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(result)}\nexit=${exitCode}\n`);
  console.log(JSON.stringify(result));
  const client = (getDb() as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
  process.exitCode = exitCode;
}
