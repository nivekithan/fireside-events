ALTER TABLE `tracks` ADD `mid` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `unqiue_mid_per_session` ON `tracks` (`mid`,`session_id`);