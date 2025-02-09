import { callsTracer, EMPTY, WithContext } from "~/lib/traces/trace.client";
import { bk } from "../bk";
import { getPublicId } from "../identity";
import { SignalingTracks } from "./signaling";
import { trace } from "@opentelemetry/api";

export async function pushRemoteTracks({
  sessionIdentityToken,
  tracks,
}: {
  tracks: Array<{ name: string; remoteSessionId: string }>;
  sessionIdentityToken: string;
}) {
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

  const { data } = await response.json();

  return data;
}

export async function removeRemoteTracks({
  sessionIdentityToken,
  tracks,
  sessionDescription,
}: {
  sessionIdentityToken: string;
  tracks: Array<{ mid: string }>;
  sessionDescription: { sdp: string; type: "offer" };
}) {
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
