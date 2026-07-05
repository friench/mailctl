CREATE TABLE `migration_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_host` text NOT NULL,
	`source_port` integer NOT NULL,
	`source_user` text NOT NULL,
	`source_ssl` text NOT NULL,
	`source_password_enc` text,
	`dest_address` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`log` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `migration_jobs_status_idx` ON `migration_jobs` (`status`);