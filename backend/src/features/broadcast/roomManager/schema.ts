import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const TracksTable = sqliteTable(
	'tracks',
	{
		id: integer().notNull().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		sessionId: text().notNull(),
		mid: text().notNull(),
	},
	(t) => {
		return [uniqueIndex('uniqie_name').on(t.name), uniqueIndex('unqiue_mid_per_session').on(t.mid, t.sessionId)];
	}
);

export const RoomVersionTable = sqliteTable('room_version', {
	id: integer().notNull().primaryKey(),
	key: text().notNull().unique(),
	version: integer().notNull().default(1),
});
