import { Connection, Server, WSMessage } from 'partyserver';
import { ClientSentMessages, ServerSentMessages } from 'signaling-messages';
import migrations from '../../../migrations/signalingDb/migrations';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { drizzle, DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { publicIdToSessionId, track } from './signalingDb/schema';

export class Signaling extends Server<Env> {
	#db: DrizzleSqliteDODatabase<any>;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.#db = drizzle(this.ctx.storage, { logger: false });
	}

	async migrate() {
		return migrate(this.#db, migrations);
	}

	async onMessage(connection: Connection, message: WSMessage): Promise<void> {
		console.log('Migrating database');
		await this.migrate();
		console.log('Database migrated');

		const publicId = connection.id;

		if (typeof message !== 'string') {
			throw new Error(`Signaling server got unsupported message type. Message must be of type of String`);
		}

		const parsedMessages = ClientSentMessages.parse(JSON.parse(message));

		if (parsedMessages.type === 'pushTrack') {
			const sessionManagerId = this.env.SessionManager.idFromName(publicId);
			const sessionManager = this.env.SessionManager.get(sessionManagerId);

			const pushLocalTracksResponse = await sessionManager.pushLocalTracks({
				sdp: parsedMessages.sdp,
				tracks: parsedMessages.tracks,
			});

			this.#sendMessageToConnection(connection, {
				type: 'rtcAnswer',
				sdp: pushLocalTracksResponse.sdp,
			});

			await this.#db.insert(publicIdToSessionId).values({ publicId: publicId, sessionId: pushLocalTracksResponse.sessionId });
			await this.#db.insert(track).values(
				parsedMessages.tracks.map((t) => {
					return { location: 'local', name: t.name, sessionId: pushLocalTracksResponse.sessionId };
				})
			);
		}
	}

	#sendMessageToConnection(connection: Connection, message: ServerSentMessages) {
		return connection.send(JSON.stringify(message));
	}
}
