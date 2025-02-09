import { context, trace } from "@opentelemetry/api";
import { callsTracer, WithContext } from "~/lib/traces/trace.client";

export function createNewRtcConnection() {
  const rtcConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.cloudflare.com:3478",
      },
    ],
    bundlePolicy: "max-bundle",
  });

  return rtcConnection;
}

export async function addNewTransreciver({
  mediaStream,
  rtcConnection,
  ctx,
}: WithContext<{
  rtcConnection: RTCPeerConnection;
  mediaStream: MediaStream;
}>) {
  const span = callsTracer.startSpan("addNewTransreciver", undefined, ctx);

  const transrecivers = mediaStream.getTracks().map((t) => {
    return rtcConnection.addTransceiver(t, { direction: "sendonly" });
  });
  const localOffer = await rtcConnection.createOffer();

  await rtcConnection.setLocalDescription(localOffer);

  const tracks = transrecivers.map((t) => {
    const mid = t.mid;
    const trackName = t.sender.track?.id;

    if (!mid || !trackName) {
      throw new Error(`Expected mid and trackName to be defined`);
    }

    return { location: "local", mid, trackName } as const;
  });

  const sdp = localOffer.sdp;

  if (!sdp) {
    throw new Error(`Expected sdp to be generated`);
  }

  span.end();

  return { sdp, tracks, transrecivers };
}
