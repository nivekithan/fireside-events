import { bk } from "../bk";

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
