CREATE TABLE `user_domains` (
	`user_id` text NOT NULL,
	`domain_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `domain_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_domains_user_id_idx` ON `user_domains` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'admin' NOT NULL;