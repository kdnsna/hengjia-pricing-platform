import { mysqlTable, mysqlSchema, AnyMySqlColumn, bigint, varchar, double, text, timestamp, index, int, json } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const allocations = mysqlTable("allocations", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	employeeId: varchar("employee_id", { length: 32 }).notNull(),
	employeeName: varchar("employee_name", { length: 64 }).notNull(),
	branch: varchar({ length: 80 }).notNull(),
	ruleId: varchar("rule_id", { length: 32 }).notNull(),
	period: varchar({ length: 7 }).notNull(),
	ratio: double().notNull(),
	reason: text().notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdBy: bigint("created_by", { mode: "number", unsigned: true }),
	createdByEmployeeId: varchar("created_by_employee_id", { length: 32 }).default(').notNull(),
});

export const appUsers = mysqlTable("app_users", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	username: varchar({ length: 64 }).notNull(),
	employeeId: varchar("employee_id", { length: 32 }).notNull(),
	name: varchar({ length: 64 }).notNull(),
	role: varchar({ length: 32 }).notNull(),
	branch: varchar({ length: 80 }).notNull(),
	position: varchar({ length: 64 }).notNull(),
	passwordHash: text("password_hash").notNull(),
	status: varchar({ length: 16 }).default('active').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
},
(table) => [
	index("app_users_role_idx").on(table.role),
	index("app_users_branch_idx").on(table.branch),
	index("app_users_username_unique").on(table.username),
	index("app_users_employee_id_unique").on(table.employeeId),
]);

export const auditLogs = mysqlTable("audit_logs", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	action: varchar({ length: 60 }).notNull(),
	actor: varchar({ length: 64 }).notNull(),
	objectType: varchar("object_type", { length: 40 }).notNull(),
	objectId: varchar("object_id", { length: 64 }).notNull(),
	detail: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const authSessions = mysqlTable("auth_sessions", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	tokenHash: varchar("token_hash", { length: 64 }).notNull(),
	userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("auth_sessions_user_idx").on(table.userId),
	index("auth_sessions_expiry_idx").on(table.expiresAt),
	index("auth_sessions_token_hash_unique").on(table.tokenHash),
]);

export const calculationBatches = mysqlTable("calculation_batches", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	period: varchar({ length: 7 }).notNull(),
	title: varchar({ length: 100 }).notNull(),
	totalScore: double("total_score").notNull(),
	employeeCount: int("employee_count").notNull(),
	status: varchar({ length: 20 }).default('draft').notNull(),
	resultSnapshot: json("result_snapshot"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	ownerEmployeeId: varchar("owner_employee_id", { length: 32 }).default(').notNull(),
	ownerBranch: varchar("owner_branch", { length: 80 }).default(').notNull(),
	createdBy: bigint("created_by", { mode: "number", unsigned: true }),
	createdByName: varchar("created_by_name", { length: 64 }).default(').notNull(),
	submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }),
	approvedBy: bigint("approved_by", { mode: "number", unsigned: true }),
	submittedAt: timestamp("submitted_at", { mode: 'string' }),
});

export const indicatorDesigns = mysqlTable("indicator_designs", {
	id: bigint({ mode: "number", unsigned: true }).autoincrement().notNull(),
	ruleId: varchar("rule_id", { length: 32 }).notNull(),
	name: varchar({ length: 160 }).notNull(),
	status: varchar({ length: 16 }).default('draft').notNull(),
	baseVersion: int("base_version").default(0).notNull(),
	definition: json().notNull(),
	testSnapshot: json("test_snapshot"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	submittedAt: timestamp("submitted_at", { mode: 'string' }),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdBy: bigint("created_by", { mode: "number", unsigned: true }),
	submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }),
	publishedBy: bigint("published_by", { mode: "number", unsigned: true }),
},
(table) => [
	index("indicator_rule_idx").on(table.ruleId),
	index("indicator_status_idx").on(table.status),
]);

export const pricingRules = mysqlTable("pricing_rules", {
	id: varchar({ length: 32 }).notNull(),
	name: varchar({ length: 160 }).notNull(),
	category: varchar({ length: 16 }).notNull(),
	groupName: varchar("group_name", { length: 64 }).notNull(),
	unit: varchar({ length: 24 }).notNull(),
	stockRate: double("stock_rate"),
	positiveRate: double("positive_rate"),
	negativeRate: double("negative_rate"),
	method: varchar({ length: 32 }).notNull(),
	sourceCode: varchar("source_code", { length: 32 }),
	metricCode: varchar("metric_code", { length: 32 }),
	status: varchar({ length: 16 }).default('active').notNull(),
	note: text(),
	formula: text(),
	definition: json(),
	version: int().default(1).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
