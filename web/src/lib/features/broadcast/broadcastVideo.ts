import { BkClient, bkClient } from "../../backend";

export async function broadcastMediaStream(
  mediaStream: MediaStream,
  { bkClient }: { bkClient: BkClient },
) {
  const sessionId = await getSessionId();
  const rtcPeerConnection = getPeerConnection();

  const transceivers = mediaStream.getTracks().map((track) => {
    return rtcPeerConnection.addTransceiver(track, { direction: "sendonly" });
  });

  const offer = await rtcPeerConnection.createOffer();

  await rtcPeerConnection.setLocalDescription(offer);
  const broadcastRes = await bkClient.broadcast.$post({
    json: {
      sessionId,
      sdp: offer.sdp!,
      tracks: transceivers.map((t) => ({
        mid: t.mid!,
        trackName: t.sender.track!.id!,
      })),
    },
  });

  const remoteSdp = await broadcastRes.json();

  await rtcPeerConnection.setRemoteDescription(remoteSdp.sessionDescription);
}

async function createNewCallsSession() {
  const res = await bkClient.sessions.$post();

  const { data } = await res.json();

  console.log({ sessionResult: data });

  const sessionId = data?.sessionId;
  const sdp = data?.sessionDescription?.sdp;
  const sdpType = data?.sessionDescription?.type;

  if (!sessionId) {
    throw new Error(`There is no sessionId`);
  }

  if (!sdp || !sdpType) {
    throw new Error(`There is no sessionDescription`);
  }

  return { sessionId, sessionDescription: { sdp, type: sdpType } };
}

let sessionId: string | null = null;

async function getSessionId() {
  if (sessionId) {
    return sessionId;
  }

  const newSession = await createNewCallsSession();

  sessionId = newSession.sessionId;

  return sessionId;
}

function createPeerConnection() {
  const peerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.cloudflare.com:3478",
      },
    ],
    bundlePolicy: "max-bundle",
  });

  return peerConnection;
}

let rtcPeerConnection: RTCPeerConnection | null = null;

function getPeerConnection() {
  if (rtcPeerConnection) return rtcPeerConnection;

  const newPeerConnection = createPeerConnection();

  rtcPeerConnection = newPeerConnection;

  return rtcPeerConnection;
}
