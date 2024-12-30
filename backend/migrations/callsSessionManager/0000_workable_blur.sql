CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`mid` text NOT NULL,
	`location` text NOT NULL,
	`remote_session_id` text,
	`is_closed` integer DEFAULT false NOT NULL,
	CONSTRAINT "location_and_remote_session_id" CHECK("tracks"."location" = 'local' and "tracks"."remote_session_id" is null or "tracks"."location" = 'remote' and "tracks"."remote_session_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniqie_name_mid` ON `tracks` (`name`,`mid`) WHERE "tracks"."is_closed" = ?;