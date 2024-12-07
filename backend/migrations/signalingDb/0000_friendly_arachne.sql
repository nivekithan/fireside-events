CREATE TABLE `public_id_to_session_id` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`session_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `public_id_to_session_id_public_id_unique` ON `public_id_to_session_id` (`public_id`);--> statement-breakpoint
CREATE TABLE `track` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`remote_session_id` text,
	CONSTRAINT "location_values" CHECK((location = 'remote' AND remote_session_id IS NOT NULL ) OR (location = 'local' AND remote_session_id IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_session_id_name` ON `track` (`session_id`,`name`);