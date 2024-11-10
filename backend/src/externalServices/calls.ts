import createClient from "openapi-fetch";
import { type paths } from "./schema/calls";

export function getCallsClient(CALLS_API_KEY: string) {
	const callsClient = createClient<paths>({
		baseUrl: "https://rtc.live.cloudflare.com/v1",
		headers: {
			"Authorization": `Bearers ${CALLS_API_KEY}`,
		},
	});

	return callsClient;
}
