import { z } from 'zod';
import migrations from '../../../../migrations/roomManager/migrations';
import { drizzle, DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { RoomVersionTable, TracksTable } from './schema';
import { eq, ne } from 'drizzle-orm';
import { WithEnv } from '../../hono';
import { Server } from 'partyserver';
import { ServerSentMessages } from 'signaling-messages';

const LocalTracksSchema = z.object({
	mid: z.string(),
	name: z.string(),
	sessionId: z.string(),
});

export type Tracks = z.infer<typeof LocalTracksSchema>;

export class RoomManager extends Server<Env> {
	static #KEY_NAME = 'room';
	#db: DrizzleSqliteDODatabase;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.#db = drizzle(ctx.storage, { casing: 'snake_case' });
	}

	async onStart(): Promise<void> {
		return this.migrate();
	}

	async migrate() {
		await migrate(this.#db, migrations);
		this.#db.insert(RoomVersionTable).values({ key: RoomManager.#KEY_NAME, version: 1 }).onConflictDoNothing().run();
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
		const newVersion = this.#increaseVersion();
		this.#poke();

		return { ok: true, version: newVersion };
	}

	async removeSession(sessionId: string) {
		this.#db.delete(TracksTable).where(eq(TracksTable.sessionId, sessionId)).run();
		const newVersion = this.#increaseVersion();

		return { ok: true, version: newVersion };
	}

	async getAllLocalTracks({ exceptSessionId }: { exceptSessionId: string }) {
		const result = this.#db.select().from(TracksTable).where(ne(TracksTable.sessionId, exceptSessionId)).all();
		const version = this.#getVersion();

		return { tracks: result, version: version };
	}

	#getVersion() {
		const result = this.#db.select().from(RoomVersionTable).where(eq(RoomVersionTable.key, RoomManager.#KEY_NAME)).all();

		if (result.length === 0) {
			throw new Error(`Room version cannot be empty`);
		}

		return result[0].version;
	}

	#increaseVersion() {
		const version = this.#getVersion();
		const result = this.#db
			.update(RoomVersionTable)
			.set({ version: version + 1 })
			.where(eq(RoomVersionTable.key, RoomManager.#KEY_NAME))
			.returning()
			.all();

		if (result.length === 0) {
			throw new Error(`Room version cannot be empty`);
		}

		return result[0].version;
	}

	#poke() {
		this.#broadcastMessageToClient({ type: 'poke', version: this.#getVersion() });
	}

	#broadcastMessageToClient(message: ServerSentMessages) {
		this.broadcast(JSON.stringify(message));
	}
}

export async function getRoomManager({ env, roomName }: WithEnv<{ roomName: string }>) {
	const roomManagerId = env.RoomManager.idFromName(roomName);
	const roomManager = env.RoomManager.get(roomManagerId);

	await roomManager.migrate();

	return roomManager;
}
