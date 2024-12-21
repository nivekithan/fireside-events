PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_track` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`m_id` text,
	`remote_session_id` text,
	CONSTRAINT "location_values" CHECK((location = 'remote' AND remote_session_id IS NOT NULL ) OR (location = 'local' AND remote_session_id IS NULL)),
	CONSTRAINT "m_id_check" CHECK((location = 'remote' AND m_id IS NULL) OR (location = 'local' AND m_id IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_track`("id", "session_id", "name", "location", "m_id", "remote_session_id") SELECT "id", "session_id", "name", "location", "m_id", "remote_session_id" FROM `track`;--> statement-breakpoint
DROP TABLE `track`;--> statement-breakpoint
ALTER TABLE `__new_track` RENAME TO `track`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_session_id_name` ON `track` (`session_id`,`name`);