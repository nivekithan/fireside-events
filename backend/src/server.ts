import { Hono } from "hono";
import { getCallsClient } from "./externalServices/calls";

export const app = new Hono<{ Bindings: Env }>();

app.post("/sessions", async (c) => {
	const appId = c.env.CALLS_APP_ID;

	const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);

	const newSession = await callsClient.POST("/apps/{appId}/sessions/new", {
		params: {
			path: {
				appId: appId,
			},
		},
	});
});
