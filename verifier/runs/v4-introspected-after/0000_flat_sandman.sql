-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `allocations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` varchar(32) NOT NULL,
	`employee_name` varchar(64) NOT NULL,
	`branch` varchar(80) NOT NULL,
	`rule_id` varchar(32) NOT NULL,
	`period` varchar(7) NOT NULL,
	`ratio` double NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`created_by` bigint unsigned,
	`created_by_employee_id` varchar(32) NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `app_users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`employee_id` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`role` varchar(32) NOT NULL,
	`branch` varchar(80) NOT NULL,
	`position` varchar(64) NOT NULL,
	`password_hash` text NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`last_login_at` timestamp
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`action` varchar(60) NOT NULL,
	`actor` varchar(64) NOT NULL,
	`object_type` varchar(40) NOT NULL,
	`object_id` varchar(64) NOT NULL,
	`detail` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`last_seen_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `calculation_batches` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`period` varchar(7) NOT NULL,
	`title` varchar(100) NOT NULL,
	`total_score` double NOT NULL,
	`employee_count` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`result_snapshot` json,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`approved_at` timestamp,
	`owner_employee_id` varchar(32) NOT NULL DEFAULT '',
	`owner_branch` varchar(80) NOT NULL DEFAULT '',
	`created_by` bigint unsigned,
	`created_by_name` varchar(64) NOT NULL DEFAULT '',
	`submitted_by` bigint unsigned,
	`approved_by` bigint unsigned,
	`submitted_at` timestamp
);
--> statement-breakpoint
CREATE TABLE `indicator_designs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`rule_id` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`base_version` int NOT NULL DEFAULT 0,
	`definition` json NOT NULL,
	`test_snapshot` json,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`submitted_at` timestamp,
	`published_at` timestamp,
	`created_by` bigint unsigned,
	`submitted_by` bigint unsigned,
	`published_by` bigint unsigned
);
--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` varchar(16) NOT NULL,
	`group_name` varchar(64) NOT NULL,
	`unit` varchar(24) NOT NULL,
	`stock_rate` double,
	`positive_rate` double,
	`negative_rate` double,
	`method` varchar(32) NOT NULL,
	`source_code` varchar(32),
	`metric_code` varchar(32),
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`note` text,
	`formula` text,
	`definition` json,
	`version` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `app_users_role_idx` ON `app_users` (`role`);--> statement-breakpoint
CREATE INDEX `app_users_branch_idx` ON `app_users` (`branch`);--> statement-breakpoint
CREATE INDEX `app_users_username_unique` ON `app_users` (`username`);--> statement-breakpoint
CREATE INDEX `app_users_employee_id_unique` ON `app_users` (`employee_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `indicator_rule_idx` ON `indicator_designs` (`rule_id`);--> statement-breakpoint
CREATE INDEX `indicator_status_idx` ON `indicator_designs` (`status`);
*/