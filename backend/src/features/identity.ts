import { sign, verify } from '@tsndr/cloudflare-worker-jwt';
import { DateTime } from 'luxon';
import { z } from 'zod';

const SessionIdenityPayloadSchema = z.object({
	sub: z.string(),
	callsSessionId: z.string(),
	exp: z.number(),
});

export type SessionIdenityPayload = z.infer<typeof SessionIdenityPayloadSchema>;

export async function createNewSessionIdentityToken({
	callsSessionId,
	userSessionId,
	jwtSecret,
}: {
	userSessionId: string;
	callsSessionId: string;
	jwtSecret: string;
}) {
	const after1Day = DateTime.utc().plus({ day: 1 }).toSeconds();

	const result = await sign(
		{ sub: userSessionId, callsSessionId: callsSessionId, exp: after1Day } satisfies SessionIdenityPayload,
		jwtSecret
	);

	return result;
}

export async function verifySessionIdentiyToken({ token, jwtSecret }: { jwtSecret: string; token: string }) {
	const parsedToken = await verify(token, jwtSecret);

	if (!parsedToken) {
		throw new Error(`Invalid session identity token`);
	}

	const { callsSessionId, sub } = SessionIdenityPayloadSchema.parse(parsedToken.payload);

	return { userSessionId: sub, callsSessionId };
}
