import { routePartykitRequest } from 'partyserver';
import { app } from './server';

export { RoomManager } from './features/broadcast/roomManager/roomManager';

export default {
	async fetch(req, env, ctx) {
		// const responseFromPartyKit = await routePartykitRequest(req, {
		// 	signal: env.Signaling,
		// });

		// if (responseFromPartyKit === null) {
		return app.fetch(req, env, ctx);
		// }

		// return responseFromPartyKit;
	},
} satisfies ExportedHandler<Env>;
