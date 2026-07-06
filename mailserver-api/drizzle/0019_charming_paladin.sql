ALTER TABLE `smtp_accounts` ADD `require_tls` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `smtp_accounts` ADD `reject_unauthorized` integer;--> statement-breakpoint
ALTER TABLE `smtp_accounts` ADD `min_tls_version` text;