import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const TracksTable = sqliteTable(
	'tracks',
	{
		id: integer().notNull().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		mid: text().notNull(),
		sessionId: text().notNull(),
	},
	(t) => {
		return [uniqueIndex('uniqie_name').on(t.name)];
	}
);
