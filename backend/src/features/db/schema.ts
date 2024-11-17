import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const participantsSchema = pgTable("participant", {
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	name: text("name").notNull().default("DEFAULT"),
	publicId: text("public_id").notNull(),
	callsSessionId: text("calls_session_id").notNull(),
});

export const tracksSchema = pgTable("track", {
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	mId: text("m_id").notNull(),
	name: text("name").notNull(),
	participantId: integer("participant_id").references(
		() => participantsSchema.id,
		{
			onDelete: "cascade",
		},
	),
});
