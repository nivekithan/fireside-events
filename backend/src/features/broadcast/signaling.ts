import { Connection, Server, WSMessage } from 'partyserver';
import { ClientSentMessages, ServerSentMessages } from 'signaling-messages';
import migrations from '../../../migrations/signalingDb/migrations';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { drizzle, DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { publicIdToSessionId, track } from './signalingDb/schema';
import { and, eq, ne } from 'drizzle-orm';
import { SessionManager } from './sessionManager';

export class Signaling extends Server<Env> {
	#db: DrizzleSqliteDODatabase<any>;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.#db = drizzle(this.ctx.storage, { logger: false });
	}

	async migrate() {
		return migrate(this.#db, migrations);
	}

	async onStart(): Promise<void> {
		return this.migrate();
	}

	async onClose(connection: Connection): Promise<void> {
		const publicId = connection.id;

		const deletedRows = await this.#db.delete(publicIdToSessionId).where(eq(publicIdToSessionId.publicId, publicId)).returning();

		if (deletedRows.length > 1) {
			throw new Error(`Expected deleted Rows to be less than or equal to 1`);
		}

		const deletedRow = deletedRows[0];

		if (!deletedRow) {
			return;
		}

		// Deletes all local tracks associated with the deleted sesssion
		const localTracks = await this.#db.delete(track).where(eq(track.sessionId, deletedRow.sessionId)).returning();

		const sessionManangerId = this.env.SessionManager.idFromName(publicId);

		const sessionMananger = this.env.SessionManager.get(sessionManangerId);

		const trackMids = localTracks.map((t) => {
			if (!t.mId) {
				throw new Error(`There is no mId on track`);
			}

			return { mId: t.mId };
		});

		await sessionMananger.deleteLocalTracks(trackMids);
	}

	async onMessage(connection: Connection, message: WSMessage): Promise<void> {
		const publicId = connection.id;

		if (typeof message !== 'string') {
			throw new Error(`Signaling server got unsupported message type. Message must be of type of String`);
		}

		const parsedMessages = ClientSentMessages.parse(JSON.parse(message));

		const sessionManagerId = this.env.SessionManager.idFromName(publicId);
		const sessionManager = this.env.SessionManager.get(sessionManagerId);

		if (parsedMessages.type === 'pushTrack') {
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
					return { location: 'local', name: t.name, sessionId: pushLocalTracksResponse.sessionId, mId: t.mId };
				})
			);

			// Add's any other tracks to the current session as remote tracks
			const newOffer = await this.newOfferForOtherTracks({ sessionId: pushLocalTracksResponse.sessionId, sessionManager: sessionManager });

			if (newOffer) {
				this.#sendMessageToConnection(connection, {
					type: 'rtcOffer',
					sdp: newOffer.sdp,
				});
			}

			const singletrack = parsedMessages.tracks[0];
			await this.informAboutNewLocalTrack({ name: singletrack.name, remoteSessionId: pushLocalTracksResponse.sessionId });
		} else if (parsedMessages.type === 'rtcAnswer') {
			await sessionManager.renegotiateAnswer({ sdp: parsedMessages.sdp });
		}
	}

	async informAboutNewLocalTrack({ name, remoteSessionId }: { remoteSessionId: string; name: string }) {
		const allOtherPublicId = await this.#db.select().from(publicIdToSessionId).where(ne(publicIdToSessionId.sessionId, remoteSessionId));

		if (allOtherPublicId.length === 0) {
			return;
		}

		const newOffers = await Promise.all(
			allOtherPublicId.map(async ({ publicId, sessionId }) => {
				const sessionManagerId = this.env.SessionManager.idFromName(publicId);
				const sessionManager = this.env.SessionManager.get(sessionManagerId);

				const offer = await sessionManager.pushRemoteTracks({ tracks: [{ name: name, sessionId: remoteSessionId }] });

				await this.#db.insert(track).values(
					offer.remoteTracks.map((t) => {
						return { remoteSessionId: t.remoteSessionId, sessionId: sessionId, location: 'remote', mId: t.mId, name: t.trackName };
					})
				);

				return { offer: offer, publicId };
			})
		);

		newOffers.forEach(({ offer, publicId }) => {
			const connection = this.getConnection(publicId);

			if (!connection) {
				return;
			}

			this.#sendMessageToConnection(connection, {
				type: 'rtcOffer',
				sdp: offer.sdp,
			});
		});
	}

	async newOfferForOtherTracks({ sessionId, sessionManager }: { sessionManager: DurableObjectStub<SessionManager>; sessionId: string }) {
		const allOtherRemoteTracks = await this.getAllRemoteTracksForSession(sessionId);

		if (allOtherRemoteTracks.length === 0) {
			return null;
		}

		const offer = await sessionManager.pushRemoteTracks({ tracks: allOtherRemoteTracks });

		await this.#db.insert(track).values(
			offer.remoteTracks.map((t) => {
				return { location: 'remote', mId: t.mId, name: t.trackName, sessionId: sessionId, remoteSessionId: t.remoteSessionId };
			})
		);

		return offer;
	}

	/**
	 * Finds all the tracks which should be an remote track for a given sessionId
	 */
	async getAllRemoteTracksForSession(sessionId: string) {
		const allTracks = this.#db
			.select()
			.from(track)
			.where(and(ne(track.sessionId, sessionId), eq(track.location, 'local')));

		return allTracks;
	}

	#sendMessageToConnection(connection: Connection, message: ServerSentMessages) {
		return connection.send(JSON.stringify(message));
	}
}
