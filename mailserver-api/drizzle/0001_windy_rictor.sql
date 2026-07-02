CREATE TABLE `domains` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`dkim_selector` text,
	`dkim_public_key` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_name_unique` ON `domains` (`name`);--> statement-breakpoint
CREATE TABLE `smtp_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`secure` integer NOT NULL,
	`user_env_var` text,
	`password_env_var` text,
	`from_address` text NOT NULL,
	`from_name` text,
	`priority` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`domain_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `smtp_accounts_active_priority_idx` ON `smtp_accounts` (`active`,`priority`);--> statement-breakpoint
CREATE INDEX `smtp_accounts_domain_id_idx` ON `smtp_accounts` (`domain_id`);