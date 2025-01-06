import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createCallsSession, getCallsClient } from '../../externalServices/calls';
import { createNewSessionIdentityToken, verifySessionIdentiyToken } from '../identity';
import { getRoomManager, Tracks } from './roomManager/roomManager';

const SessionIdentitySchema = z.object({
	'x-session-identity-token': z.string(),
});

export const CallsProxyRouter = new Hono<{ Bindings: Env }>()
	.post('/sessions/new', zValidator('json', z.object({ userSessionId: z.string(), room: z.string() })), async (c) => {
		const { userSessionId, room } = c.req.valid('json');

		const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);
		const sessionId = await createCallsSession({ appId: c.env.CALLS_APP_ID, callsClient });

		const sessionIdenityToken = await createNewSessionIdentityToken({
			callsSessionId: sessionId,
			jwtSecret: c.env.JWT_SECRET,
			userSessionId,
			room,
		});

		return c.json({ ok: true, data: { sessionIdentityToken: sessionIdenityToken } } as const);
	})
	.post(
		'/tracks/new',
		zValidator('header', SessionIdentitySchema),
		zValidator(
			'json',
			z.union([
				z.object({
					sessionDescription: z.object({ sdp: z.string(), type: z.literal('offer') }),
					tracks: z.array(z.object({ location: z.literal('local'), mid: z.string(), trackName: z.string() })),
				}),
				z.object({
					tracks: z.array(z.object({ location: z.literal('remote'), sessionId: z.string(), trackName: z.string() })),
				}),
			])
		),
		async (c) => {
			const sessionIdentityToken = c.req.valid('header')['x-session-identity-token'];

			const { callsSessionId, room } = await verifySessionIdentiyToken({
				jwtSecret: c.env.JWT_SECRET,
				token: sessionIdentityToken,
			});

			const payload = c.req.valid('json');

			const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);
			const response = await callsClient.POST('/apps/{appId}/sessions/{sessionId}/tracks/new', {
				params: {
					path: {
						appId: c.env.CALLS_APP_ID,
						sessionId: callsSessionId,
					},
				},
				body: payload,
			});

			console.log(`[CallsProxyRouter] POST /tracks/new response: ${JSON.stringify(response)}`);

			const tracks = response.data?.tracks;

			if (!tracks) {
				return c.json({ data: response.data });
			}

			const localTracksToBeAdded: Array<Tracks> = [];

			for (const t of tracks) {
				const isLocalTracksGotPushed = 'sessionDescription' in payload;

				if (!isLocalTracksGotPushed) {
					break;
				}

				const mid = t.mid;
				const name = t.trackName;

				if (!mid || !name) {
					throw new Error('Invalid track data');
				}

				localTracksToBeAdded.push({ mid, name, sessionId: callsSessionId });
			}

			// console.log({ countOfTracksToBeAdded: localTracksToBeAdded.length, tracks: tracks, responseFromCalls: response.data });
			if (localTracksToBeAdded.length === 0) {
				return c.json({ data: response.data });
			}

			const roomManager = await getRoomManager({ env: c.env, roomName: room });
			await roomManager.addTracks(localTracksToBeAdded);

			return c.json({ data: response.data });
		}
	)
	.put(
		'sessions/renegotiate',

		zValidator('header', SessionIdentitySchema),

		zValidator('json', z.object({ sessionDescription: z.object({ sdp: z.string(), type: z.literal('answer') }) })),

		async (c) => {
			const sessionIdentityToken = c.req.valid('header')['x-session-identity-token'];

			const { callsSessionId } = await verifySessionIdentiyToken({
				jwtSecret: c.env.JWT_SECRET,
				token: sessionIdentityToken,
			});

			const payload = c.req.valid('json');

			const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);
			const response = await callsClient.PUT('/apps/{appId}/sessions/{sessionId}/renegotiate', {
				params: {
					path: {
						appId: c.env.CALLS_APP_ID,
						sessionId: callsSessionId,
					},
				},
				body: payload,
			});

			return c.json({ data: response.data, error: response.error });
		}
	)
	.put(
		'/tracks/close',
		zValidator('header', SessionIdentitySchema),
		zValidator(
			'json',
			z.object({
				sessionDescription: z.object({
					sdp: z.string(),
					type: z.literal('offer'),
				}),
				tracks: z.array(z.object({ mid: z.string() })),
			})
		),
		async (c) => {
			const sessionIdentityToken = c.req.valid('header')['x-session-identity-token'];

			const { callsSessionId } = await verifySessionIdentiyToken({
				jwtSecret: c.env.JWT_SECRET,
				token: sessionIdentityToken,
			});

			const payload = c.req.valid('json');

			const callsClient = getCallsClient(c.env.CALLS_API_TOKEN);

			const response = await callsClient.PUT('/apps/{appId}/sessions/{sessionId}/tracks/close', {
				params: {
					path: {
						appId: c.env.CALLS_APP_ID,
						sessionId: callsSessionId,
					},
				},
				body: payload,
			});

			return c.json({ data: response.data, error: response.error });
		}
	)
	.get('/local_tracks', zValidator('header', SessionIdentitySchema), async (c) => {
		const sessionIdentityToken = c.req.valid('header')['x-session-identity-token'];

		const { room, callsSessionId } = await verifySessionIdentiyToken({
			jwtSecret: c.env.JWT_SECRET,
			token: sessionIdentityToken,
		});

		const roomManager = await getRoomManager({ env: c.env, roomName: room });

		const tracks = (await roomManager.getAllLocalTracks({ exceptSessionId: callsSessionId })) as {
			tracks: {
				mid: string;
				sessionId: string;
				id: number;
				name: string;
			}[];
			version: number;
		};

		return c.json({ ok: true, data: tracks } as const);
	});
type B<T> = {
	[K in keyof T as T[K] extends Disposable[keyof Disposable] ? never : K]: T[K];
};
