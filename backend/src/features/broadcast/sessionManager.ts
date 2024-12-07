import { DurableObject } from "cloudflare:workers";
import { getCallsClient } from "../../externalServices/calls";

export class SessionManager extends DurableObject<Env> {
	static SESSION_ID_KEY = "SESSION_ID";

	#sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.#sql = ctx.storage.sql;
	}

	async pushLocalTracks(
		{ tracks, sdp }: {
			tracks: Array<{ mId: string; name: string }>;
			sdp: string;
		},
	) {
		const currentSessionId = await this.#getSessionId();

		if (currentSessionId) {
			throw new Error(
				`SesssionId has already been generated. You can call pushLocalTracks only for new sessions`,
			);
		}

		const callsClient = getCallsClient(this.env.CALLS_API_TOKEN);

		const sessionIdRes = await this.ctx.blockConcurrencyWhile(async () => {
			const sessionIdRes = await callsClient.POST(
				"/apps/{appId}/sessions/new",
				{
					params: { path: { appId: this.env.CALLS_APP_ID } },
				},
			);

			return sessionIdRes;
		});

		if (sessionIdRes.error) {
			throw new Error(`Unable to generate new SesssionId`);
		}

		const sessionId = sessionIdRes.data.sessionId;

		if (!sessionId) {
			throw new Error(
				`No sessionId on the response of the /sessions/new endpoint. Instead got ${
					JSON.stringify(sessionIdRes.data)
				}`,
			);
		}

		this.#setSessionId(
			sessionId,
		);

		const tracksResponse = await callsClient.POST(
			"/apps/{appId}/sessions/{sessionId}/tracks/new",
			{
				params: {
					path: {
						sessionId: sessionId,
						appId: this.env.CALLS_APP_ID,
					},
				},
				body: {
					sessionDescription: {
						type: "offer",
						sdp: sdp,
					},
					tracks: tracks.map((t) => {
						return {
							location: "local",
							mid: t.mId,
							trackName: t.name,
						} as const;
					}),
				},
			},
		);

		if (tracksResponse.error) {
			throw new Error(
				`Error in pushing local tracks to calls api ${
					JSON.stringify(tracksResponse)
				}`,
			);
		}

		const answer = tracksResponse.data.sessionDescription;

		if (!answer || !answer.sdp || !answer.type) {
			throw new Error(
				`Could not getting answer SDP from calls API instead got ${tracksResponse.data}`,
			);
		}

		return { sdp: answer.sdp, type: answer.type, sessionId: sessionId };
	}

	async #getSessionId() {
		const value = await this.ctx.storage.get<string | undefined>(
			SessionManager.SESSION_ID_KEY,
		);

		if (!value) {
			return null;
		}

		return value;
	}

	#setSessionId(sessionId: string) {
		this.ctx.storage.put(SessionManager.SESSION_ID_KEY, sessionId);
	}

	async #requireSessionId() {
		const sessionId = await this.#getSessionId();

		if (!sessionId) {
			throw new Error(
				`Calling this method requires sesssionId to be created. To create sessionId call pushLocalTracks method first`,
			);
		}

		return sessionId;
	}
}
