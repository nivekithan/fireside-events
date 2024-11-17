import { Hono } from "hono";
import { createCallsSession, getCallsClient } from "./externalServices/calls";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { z } from "zod";
import { connectDb } from "./features/db/connect";
import { createParticipant, createTracks } from "./features/db/modals";

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
			sdp: z.string(),
			tracks: z.array(z.object({ mid: z.string(), trackName: z.string() })),
		}),
	),
	zValidator("header", z.object({ "x-public-id": z.string() })),
	async (c) => {
		const data = c.req.valid("json");
		const { "x-public-id": publicId } = c.req.valid("header");

		const appId = c.env.CALLS_APP_ID;
		const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);
		const db = await connectDb(c.env);

		const callsSessionId = await createCallsSession({ appId, callsClient });
		console.log("Creating participant");
		const participant = await createParticipant({
			db,
			callsSessionId,
			publicId,
		});
		console.log("created participant");

		console.log("Creating tacks");
		await createTracks({
			participantId: participant.id,
			tracks: data.tracks.map((t) => ({ name: t.trackName, mId: t.mid })),
			db,
		});
		console.log("Created tracks");

		const tracks = data.tracks.map((
			t,
		) => ({ ...t, location: "local", sessionId: callsSessionId } as const));
		const sessionDescription = { type: "offer", sdp: data.sdp } as const;

		const res = await callsClient.POST(
			"/apps/{appId}/sessions/{sessionId}/tracks/new",
			{
				params: {
					path: {
						appId: appId,
						sessionId: callsSessionId,
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
