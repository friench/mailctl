CREATE TABLE `send_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`account_used` text,
	`message_id` text,
	`api_key_id` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `send_jobs_pending_ready_idx` ON `send_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `send_jobs_api_key_id_idx` ON `send_jobs` (`api_key_id`);