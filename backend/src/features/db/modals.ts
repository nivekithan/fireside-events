import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { participantsSchema, tracksSchema } from "./schema";
import { eq } from "drizzle-orm";

export async function createParticipant(
	{ publicId, callsSessionId, db }: {
		publicId: string;
		callsSessionId: string;
		db: PostgresJsDatabase;
	},
) {
	const res = await db.insert(participantsSchema).values({
		publicId,
		callsSessionId,
	}).returning();

	if (res.length !== 1) {
		throw new Error("No pariticpant is created");
	}

	return res[0];
}

export async function createTracks(
	{ tracks, participantId, db }: {
		db: PostgresJsDatabase;
		participantId: number;
		tracks: Array<{ mId: string; name: string }>;
	},
) {
	const res = await db.insert(tracksSchema).values(tracks.map((t) => {
		return { mId: t.mId, name: t.name, participantId };
	}));

	return res;
}

export async function deleteParticipant(
	{ publicId, db }: { publicId: string; db: PostgresJsDatabase },
) {
	const res = await db.delete(participantsSchema).where(
		eq(participantsSchema.publicId, publicId),
	);

	return res;
}
