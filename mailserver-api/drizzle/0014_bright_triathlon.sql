CREATE TABLE `access_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match_type` text NOT NULL,
	`action` text NOT NULL,
	`value` text NOT NULL,
	`recipient` text,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_rules_lookup_idx` ON `access_rules` (`match_type`,`value`);