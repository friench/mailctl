CREATE TABLE `aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`target` text NOT NULL,
	`domain_id` text,
	`source` text DEFAULT 'panel' NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aliases_address_unique` ON `aliases` (`address`);--> statement-breakpoint
CREATE INDEX `aliases_address_idx` ON `aliases` (`address`);--> statement-breakpoint
CREATE INDEX `aliases_domain_id_idx` ON `aliases` (`domain_id`);--> statement-breakpoint
ALTER TABLE `domains` ADD `dkim_status` text;--> statement-breakpoint
ALTER TABLE `domains` ADD `source` text DEFAULT 'panel' NOT NULL;--> statement-breakpoint
ALTER TABLE `domains` ADD `last_synced_at` integer;--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `source` text DEFAULT 'panel' NOT NULL;--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `externally_managed` integer DEFAULT false NOT NULL;