import { BkClient, connectionId } from "../../backend";

export async function broadcastMediaStream(
  mediaStream: MediaStream,
  { bkClient }: { bkClient: BkClient },
) {
  const rtcPeerConnection = getPeerConnection();

  const transceivers = mediaStream.getTracks().map((track) => {
    return rtcPeerConnection.addTransceiver(track, { direction: "sendonly" });
  });

  const offer = await rtcPeerConnection.createOffer();

  await rtcPeerConnection.setLocalDescription(offer);
  const broadcastRes = await bkClient.broadcast.$post({
    json: {
      sdp: offer.sdp!,

      tracks: transceivers.map((t) => ({
        mid: t.mid!,
        trackName: t.sender.track!.id!,
      })),
    },
    header: {
      "x-public-id": connectionId,
    },
  });

  const remoteSdp = await broadcastRes.json();

  await rtcPeerConnection.setRemoteDescription(remoteSdp.sessionDescription);

  return rtcPeerConnection;
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

  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(
      `[DEBUG] New connectionState: ${peerConnection.connectionState}`,
    );
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
