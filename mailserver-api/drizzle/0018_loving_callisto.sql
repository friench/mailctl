CREATE TABLE `suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`reason` text DEFAULT 'manual' NOT NULL,
	`source` text,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppressions_address_unique` ON `suppressions` (`address`);--> statement-breakpoint
ALTER TABLE `api_keys` ADD `suppression_exempt` integer DEFAULT false NOT NULL;