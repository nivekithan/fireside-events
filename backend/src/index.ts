import { app } from "./server";
import { routePartykitRequest } from "partyserver";

export default {
	async fetch(req, env, ctx) {
		const responseFromPartyKit = await routePartykitRequest(req, {
			EventRoom: env.EventRoom,
		});

		if (responseFromPartyKit === null) {
			return app.fetch(req, env, ctx);
		}

		return responseFromPartyKit;
	},
} satisfies ExportedHandler<Env>;

export { EventRoom } from "./features/eventRoom";
