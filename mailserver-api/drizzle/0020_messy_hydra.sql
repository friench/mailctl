CREATE INDEX `bounce_events_created_at_idx` ON `bounce_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `send_jobs_message_id_idx` ON `send_jobs` (`message_id`);