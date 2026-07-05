CREATE TABLE `mailbox_sieve` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`vacation_enabled` integer DEFAULT false NOT NULL,
	`vacation_subject` text,
	`vacation_message` text,
	`vacation_days` integer DEFAULT 7 NOT NULL,
	`rules` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
