ALTER TABLE `mailboxes` ADD `send_blocked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `receive_blocked` integer DEFAULT false NOT NULL;