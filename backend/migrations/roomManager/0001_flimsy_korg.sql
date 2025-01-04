CREATE TABLE `room_version` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_version_key_unique` ON `room_version` (`key`);