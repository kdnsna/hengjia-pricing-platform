import { mysqlTable, serial, varchar, text, timestamp, double, int, json, index, bigint } from "drizzle-orm/mysql-core";

export const pricingRules = mysqlTable("pricing_rules", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 16 }).notNull(),
  groupName: varchar("group_name", { length: 64 }).notNull(),
  unit: varchar("unit", { length: 24 }).notNull(),
  stockRate: double("stock_rate"),
  positiveRate: double("positive_rate"),
  negativeRate: double("negative_rate"),
  method: varchar("method", { length: 32 }).notNull(),
  sourceCode: varchar("source_code", { length: 32 }),
  metricCode: varchar("metric_code", { length: 32 }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  note: text("note"),
  formula: text("formula"),
  definition: json("definition"),
  version: int("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const indicatorDesigns = mysqlTable("indicator_designs", {
  id: serial("id").primaryKey(),
  ruleId: varchar("rule_id", { length: 32 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  baseVersion: int("base_version").notNull().default(0),
  definition: json("definition").notNull(),
  testSnapshot: json("test_snapshot"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  publishedAt: timestamp("published_at"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }),
  publishedBy: bigint("published_by", { mode: "number", unsigned: true }),
}, (table) => [
  index("indicator_rule_idx").on(table.ruleId),
  index("indicator_status_idx").on(table.status),
]);

export const allocations = mysqlTable("allocations", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id", { length: 32 }).notNull(),
  employeeName: varchar("employee_name", { length: 64 }).notNull(),
  branch: varchar("branch", { length: 80 }).notNull(),
  ruleId: varchar("rule_id", { length: 32 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  ratio: double("ratio").notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdByEmployeeId: varchar("created_by_employee_id", { length: 32 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const batches = mysqlTable("calculation_batches", {
  id: serial("id").primaryKey(),
  period: varchar("period", { length: 7 }).notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  totalScore: double("total_score").notNull(),
  employeeCount: int("employee_count").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  resultSnapshot: json("result_snapshot"),
  ownerEmployeeId: varchar("owner_employee_id", { length: 32 }).notNull().default(""),
  ownerBranch: varchar("owner_branch", { length: 80 }).notNull().default(""),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdByName: varchar("created_by_name", { length: 64 }).notNull().default(""),
  submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }),
  approvedBy: bigint("approved_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: varchar("action", { length: 60 }).notNull(),
  actor: varchar("actor", { length: 64 }).notNull(),
  objectType: varchar("object_type", { length: 40 }).notNull(),
  objectId: varchar("object_id", { length: 64 }).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appUsers = mysqlTable("app_users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  employeeId: varchar("employee_id", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  branch: varchar("branch", { length: 80 }).notNull(),
  position: varchar("position", { length: 64 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
}, (table) => [
  index("app_users_role_idx").on(table.role),
  index("app_users_branch_idx").on(table.branch),
]);

export const authSessions = mysqlTable("auth_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (table) => [
  index("auth_sessions_user_idx").on(table.userId),
  index("auth_sessions_expiry_idx").on(table.expiresAt),
]);
