import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import migrations from '../../../../migrations/callsSessionManager/migrations';
import { drizzle, DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { TracksTable } from './schema';
import { eq } from 'drizzle-orm';

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

		this.#db = drizzle(ctx.storage);
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

	async getAllLocalTracks() {
		const result = this.#db.select().from(TracksTable).all();

		return Object.groupBy(result, (t) => t.sessionId);
	}
}
