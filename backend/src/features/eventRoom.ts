import { Env } from "hono";
import { Connection, ConnectionContext, Server } from "partyserver";

export class EventRoom extends Server {
	leaderId: string | null;
	env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.leaderId = null;
		this.env = env;
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

	sendToConnection(connection: Connection, msg: EventRoomMessages) {
		connection.send(JSON.stringify(msg));
	}
}

export type EventRoomMessages = {
	type: "membershipStatus";
	status: "leader" | "participant";
};
