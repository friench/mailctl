CREATE TABLE `fetchmail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_server` text NOT NULL,
	`protocol` text NOT NULL,
	`port` integer,
	`username` text NOT NULL,
	`password_enc` text NOT NULL,
	`dest_address` text NOT NULL,
	`ssl` integer DEFAULT true NOT NULL,
	`keep` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
