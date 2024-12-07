import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const publicIdToSessionId = sqliteTable('public_id_to_session_id', {
	id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
	publicId: text('public_id').unique().notNull(),
	sessionId: text('session_id').notNull(),
});

export const track = sqliteTable(
	'track',
	{
		id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
		sessionId: text('session_id').notNull(),
		name: text('name').notNull(),
		location: text('location').notNull(),
		remoteSessionId: text('remote_session_id'),
	},
	(t) => {
		return {
			unique_session_id_name: unique('unique_session_id_name').on(t.sessionId, t.name),
			location_values: check(
				'location_values',
				sql`(location = 'remote' AND remote_session_id IS NOT NULL ) OR (location = 'local' AND remote_session_id IS NULL)`
			),
		};
	}
);
