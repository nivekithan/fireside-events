import createClient from "openapi-fetch";
import { type paths } from "./schema/calls";

export function getCallsClient(CALLS_API_KEY: string) {
	const callsClient = createClient<paths>({
		baseUrl: "https://rtc.live.cloudflare.com/v1",
		headers: {
			"Authorization": `Bearer ${CALLS_API_KEY}`,
		},
	});

	return callsClient;
}

export type CallsClient = ReturnType<typeof getCallsClient>;

export async function createCallsSession(
	{ callsClient, appId }: { callsClient: CallsClient; appId: string },
) {
	const session = await callsClient.POST("/apps/{appId}/sessions/new", {
		params: {
			path: {
				appId: appId,
			},
		},
	});

	const data = session.data;

	const sessionId = data?.sessionId;

	if (!sessionId) {
		throw new Error(`There is no sessionId`);
	}

	return sessionId;
}
