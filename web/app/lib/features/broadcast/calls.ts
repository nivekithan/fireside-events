import {
  callsTracer,
  EMPTY,
  StatusCode,
  WithContext,
} from "~/lib/traces/trace.client";
import { bk } from "../bk";
import { getPublicId } from "../identity";
import { SpanStatusCode } from "@opentelemetry/api";

export async function pushRemoteTracks({
  sessionIdentityToken,
  tracks,
  ctx,
}: WithContext<{
  tracks: Array<{ name: string; remoteSessionId: string }>;
  sessionIdentityToken: string;
}>) {
  const span = callsTracer.startSpan("pushRemoteTracks", undefined, ctx);
  try {
    span.setAttribute("sessionIdentityToken", sessionIdentityToken);

    span.addEvent("Pushing remote tracks to backend", {
      body: JSON.stringify(tracks),
    });

    await new Promise((r) => setTimeout(r, 1_000)); // Wait for 1 second to see if the session identity token has
    const response = await bk.calls.tracks.new.$post({
      header: { "x-session-identity-token": sessionIdentityToken },
      json: {
        tracks: tracks.map((t) => {
          return {
            location: "remote",
            sessionId: t.remoteSessionId,
            trackName: t.name,
          };
        }),
      },
    });

    const { data: pushRemoteTracksRes } = await response.json();

    if (!pushRemoteTracksRes || !pushRemoteTracksRes.tracks) {
      throw new Error(`Expected pushRemoteTracksRes to be defined`);
    }

    const sucessfullyPushedTracks = pushRemoteTracksRes.tracks
      ?.map((t) => {
        // If pushing some tracks failed. Log them as warning
        // TODO: Handle this better

        if (t.error) {
          console.warn(
            `Pushing track: ${t.trackName} of remoteSession: ${t.sessionId} failed due to ${t.error.errorCode}: ${t.error.errorDescription}`
          );
          return null;
        }

        const mid = t.mid;
        const name = t.trackName;
        const sessionId = t.sessionId;

        if (!mid || !name || !sessionId) {
          console.warn(`Invalid track data: ${JSON.stringify(t)}`);
          return null;
        }

        return { mid: mid, name: name, sessionId: sessionId };
      })
      .filter(Boolean);

    const offerFromCalls = pushRemoteTracksRes?.sessionDescription;

    if (!offerFromCalls) {
      throw new Error(
        `Expected offer to be returned from calls: ${JSON.stringify(
          pushRemoteTracksRes
        )}`
      );
    }

    const { sdp, type } = offerFromCalls;

    if (!sdp || !type) {
      throw new Error(`Expected sdp and type to be returned from calls`);
    }

    return {
      tracks: sucessfullyPushedTracks,
      sessionDescription: { sdp, type },
    };
  } catch (err) {
    // @ts-expect-error
    span.setStatus(SpanStatusCode.ERROR);

    if (err instanceof Error) {
      span.recordException(err);
    } else {
      console.error(err);
      span.recordException("unkown error while pushingRemoteTracks");
    }

    throw err;
  } finally {
    span.end();
  }
}

export async function removeRemoteTracks({
  sessionIdentityToken,
  tracks,
  sessionDescription,
  ctx,
}: WithContext<{
  sessionIdentityToken: string;
  tracks: Array<{ mid: string }>;
  sessionDescription: { sdp: string; type: "offer" };
}>) {
  const span = callsTracer.startSpan(
    "removeRemoteTracks",
    {
      attributes: {
        sessionIdentityToken,
        "sessionDescription.sdp": sessionDescription.sdp,
        "sessionDescription.type": sessionDescription.type,
      },
    },
    ctx
  );

  try {
    const response = await bk.calls.tracks.close.$put({
      header: { "x-session-identity-token": sessionIdentityToken },
      json: {
        sessionDescription,
        tracks: tracks.map((t) => {
          return {
            mid: t.mid,
          };
        }),
      },
    });

    const { data } = await response.json();

    return data;
  } finally {
    span.end();
  }
}

export async function createNewSession({ ctx }: WithContext<{}>) {
  const span = callsTracer.startSpan("createNewSession", undefined, ctx);

  const sessionIdentityTokenRes = await bk.calls.sessions.new.$post({
    json: {
      userSessionId: getPublicId(),
      room: "DEFAULT",
    },
  });

  const sessionIdentityToken = (await sessionIdentityTokenRes.json()).data
    .sessionIdentityToken;

  span.setAttribute("session.token", sessionIdentityToken);
  span.end();

  return sessionIdentityToken;
}

export type LocalTrack = {
  location: "local";
  mid: string;
  trackName: string;
};

export type RemoteTrack = {
  location: "remote";
  trackName: string;
  sessionId: string;
};

export type Tracks = Array<LocalTrack> | Array<RemoteTrack>;

export async function pushLocalTracks({
  sessionIdentityToken,
  sdp,
  tracks,
  ctx,
}: WithContext<{
  sessionIdentityToken: string;
  tracks: Array<LocalTrack>;
  sdp: string;
}>) {
  const span = callsTracer.startSpan("pushLocalTracks", undefined, ctx);
  const pushLocalTracksRes = await bk.calls.tracks.new.$post({
    header: { "x-session-identity-token": sessionIdentityToken },
    json: {
      sessionDescription: { type: "offer", sdp: sdp },
      tracks: tracks,
    },
  });

  const pushLocalTracksData = await pushLocalTracksRes.json();

  span.setAttribute(
    "requiresImmediateRenegotitation",
    pushLocalTracksData.data?.requiresImmediateRenegotiation ?? EMPTY
  );
  span.setAttribute(
    "sessionDescription.sdp",
    pushLocalTracksData.data?.sessionDescription?.sdp ?? EMPTY
  );
  span.setAttribute(
    "sessionDescription.type",
    pushLocalTracksData.data?.sessionDescription?.type ?? EMPTY
  );

  span.setAttribute(
    "tracks",
    JSON.stringify(pushLocalTracksData.data?.tracks ?? EMPTY)
  );

  span.end();

  return pushLocalTracksData.data;
}

export async function getOtherPeersLocalTracks({
  ctx,
  sessionIdentityToken,
}: WithContext<{ sessionIdentityToken: string }>) {
  const span = callsTracer.startSpan(
    "getOtherPeersLocalTracks",
    undefined,
    ctx
  );

  span.setAttribute("sessionIdentityToken", sessionIdentityToken);

  const res = await bk.calls.local_tracks.$get({
    header: { "x-session-identity-token": sessionIdentityToken },
  });

  const {
    data: { tracks: remoteTracks, version },
  } = await res.json();

  span.setAttribute("tracks.version", version);
  span.end();

  return { remoteTracks, version };
}

export async function renegotiateSession({
  ctx,
  sessionIdentityToken,
  sessionDescription,
}: WithContext<{
  sessionIdentityToken: string;
  sessionDescription: { sdp: string; type: "answer" };
}>) {
  const span = callsTracer.startSpan("renegotiateSession", undefined, ctx);

  try {
    span.setAttribute("sessionIdentityToken", sessionIdentityToken);
    span.setAttribute("sessionDescription.sdp", sessionDescription.sdp);
    span.setAttribute("sessionDescription.type", sessionDescription.type);

    const regenotiateRes = await bk.calls.sessions.renegotiate.$put({
      header: { "x-session-identity-token": sessionIdentityToken },
      json: {
        sessionDescription: {
          sdp: sessionDescription.sdp,
          type: sessionDescription.type,
        },
      },
    });

    const regenotiateData = await regenotiateRes.json();

    console.log(`Regneotiate Respone data`, regenotiateData);

    return regenotiateData;
  } finally {
    span.end();
  }
}
