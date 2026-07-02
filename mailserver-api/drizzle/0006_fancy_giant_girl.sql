CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL
);
