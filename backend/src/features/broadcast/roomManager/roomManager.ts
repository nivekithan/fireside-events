import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import migrations from '../../../../migrations/roomManager/migrations';
import { drizzle, DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { TracksTable } from './schema';
import { eq, ne } from 'drizzle-orm';
import { WithEnv } from '../../hono';

const LocalTracksSchema = z.object({
	mid: z.string(),
	name: z.string(),
	sessionId: z.string(),
});

export type Tracks = z.infer<typeof LocalTracksSchema>;

export class RoomManager extends DurableObject<Env> {
	#db: DrizzleSqliteDODatabase;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.#db = drizzle(ctx.storage, { casing: 'snake_case' });
	}

	async migrate() {
		return migrate(this.#db, migrations);
	}

	async addTracks(tracks: Array<Tracks>) {
		const result = this.#db
			.insert(TracksTable)
			.values(
				tracks.map((t) => {
					return { mid: t.mid, name: t.name, sessionId: t.sessionId };
				})
			)
			.run();

		return { ok: true };
	}

	async removeSession(sessionId: string) {
		this.#db.delete(TracksTable).where(eq(TracksTable.sessionId, sessionId)).run();

		return { ok: true };
	}

	async getAllLocalTracks({ exceptSessionId }: { exceptSessionId: string }) {
		const result = this.#db.select().from(TracksTable).where(ne(TracksTable.sessionId, exceptSessionId)).all();

		return result;
	}
}

export async function getRoomManager({ env, roomName }: WithEnv<{ roomName: string }>) {
	const roomManagerId = env.RoomManager.idFromName(roomName);
	const roomManager = env.RoomManager.get(roomManagerId);

	await roomManager.migrate();

	return roomManager;
}
