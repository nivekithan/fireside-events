import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createCallsSession, getCallsClient } from '../../externalServices/calls';
import { createNewSessionIdentityToken, verifySessionIdentiyToken } from '../identity';

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
					sessionDesciption: z.object({ sdp: z.string(), type: z.literal('offer') }),
					tracks: z.array(z.object({ location: z.literal('local'), mid: z.string(), trackName: z.string() })),
				}),
				z.object({
					tracks: z.array(z.object({ localtion: z.literal('remote'), sessionId: z.string(), trackName: z.string() })),
				}),
			])
		),
		async (c) => {
			const sessionIdentityToken = c.req.valid('header')['x-session-identity-token'];

			const { callsSessionId } = await verifySessionIdentiyToken({
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

			return c.json({ data: response.data, error: response.error });
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
	);
