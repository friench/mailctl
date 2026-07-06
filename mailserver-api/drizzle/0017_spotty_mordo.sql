CREATE TABLE `bounce_events` (
	`id` text PRIMARY KEY NOT NULL,
	`send_job_id` text,
	`recipient` text NOT NULL,
	`type` text DEFAULT 'bounce' NOT NULL,
	`classification` text DEFAULT 'unknown' NOT NULL,
	`status_code` text,
	`diagnostic` text,
	`original_message_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`send_job_id`) REFERENCES `send_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bounce_events_recipient_idx` ON `bounce_events` (`recipient`);--> statement-breakpoint
CREATE INDEX `bounce_events_send_job_id_idx` ON `bounce_events` (`send_job_id`);