import { Connection, ConnectionContext, Server, WSMessage } from "partyserver";
import { deleteParticipant } from "./db/modals";
import { connectDb } from "./db/connect";

export class EventRoom extends Server {
	leaderId: string | null;
	env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.leaderId = null;
		this.env = env;
	}

	async onClose(
		connection: Connection,
	): Promise<void> {
		if (this.leaderId === connection.id) {
			this.leaderId = null;
		}

		const db = connectDb(this.env);

		await deleteParticipant({ publicId: connection.id, db });
	}
	onConnect(
		connection: Connection,
		ctx: ConnectionContext,
	): void | Promise<void> {
		if (this.leaderId) {
			this.sendToConnection(connection, {
				type: "membershipStatus",
				status: "participant",
			});
			return;
		}

		const id = connection.id;
		this.leaderId = id;

		this.sendToConnection(connection, {
			status: "leader",
			type: "membershipStatus",
		});
	}

	onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
		if (typeof message !== "string") {
			throw new Error(`EventRoom supports only string messages.`);
		}

		const data = safeParseJson<EventRoomClientMessage>(
			message,
			`Event rooms expects all messages to be valid json. `,
		);

		if (data.type === "newTracks") {
			this.typedBroadcast(connection, {
				type: "pullTracks",
				tracks: data.tracks,
			});
		}
	}

	typedBroadcast(connection: Connection, msg: EventRoomServerMessages) {
		this.broadcast(JSON.stringify(msg), [connection.id]);
	}

	sendToConnection(connection: Connection, msg: EventRoomServerMessages) {
		connection.send(JSON.stringify(msg));
	}
}

export type EventRoomClientMessage = {
	type: "newTracks";
	tracks: Array<{ trackName: string; sessionId: string }>;
};

export type EventRoomServerMessages = {
	type: "membershipStatus";
	status: "leader" | "participant";
} | {
	type: "pullTracks";
	tracks: Array<{ trackName: string; sessionId: string }>;
};

function safeParseJson<T>(data: string, erorrMsg: string) {
	try {
		const result = JSON.parse(data) as T;
		return result;
	} catch (_err) {
		throw new Error(erorrMsg);
	}
}
