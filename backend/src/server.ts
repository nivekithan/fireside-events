import { Hono } from "hono";
import { getCallsClient } from "./externalServices/calls";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { z } from "zod";

export const app = new Hono<{ Bindings: Env }>().use("*", cors()).post(
	"/sessions",
	async (c) => {
		const appId = c.env.CALLS_APP_ID;

		const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);

		console.log(`[DEBUG] ${c.env.CALLS_API_TOKEN}`);
		const newSession = await callsClient.POST("/apps/{appId}/sessions/new", {
			params: {
				path: {
					appId: appId,
				},
			},
		});

		console.log({ newSession });

		return c.json({ data: newSession.data });
	},
).post(
	"/broadcast",
	zValidator(
		"json",
		z.object({
			sessionId: z.string(),
			sdp: z.string(),
			tracks: z.array(z.object({ mid: z.string(), trackName: z.string() })),
		}),
	),
	async (c) => {
		const data = c.req.valid("json");

		const appId = c.env.CALLS_APP_ID;
		const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);

		const tracks = data.tracks.map((
			t,
		) => ({ ...t, location: "local" } as const));
		const sessionDescription = { type: "offer", sdp: data.sdp } as const;

		const res = await callsClient.POST(
			"/apps/{appId}/sessions/{sessionId}/tracks/new",
			{
				params: {
					path: {
						appId: appId,
						sessionId: data.sessionId,
					},
				},
				body: {
					tracks,
					sessionDescription,
				},
			},
		);

		return c.json({
			sessionDescription: {
				sdp: res.data!.sessionDescription!.sdp!,
				type: res.data!.sessionDescription!.type!,
			},
		});
	},
);
