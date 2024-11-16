import { createStore } from "@xstate/store";

type BroadcastState = {
  state: "determining";
} | {
  state: "prompt";
} | {
  state: "granted";
} | {
  state: "broadcasting";
  localMediaStream: MediaStream;
  rtcPeerConnection: RTCPeerConnection;
} | {
  state: "denied";
};

const initialState: BroadcastState = {
  state: "determining",
};

export const broadcastState = createStore({
  context: initialState as BroadcastState,

  on: {
    promptConsent: {
      state: "prompt",
    },
    consentDenied: {
      state: "denied",
    },
    consentGranted: {
      state: "granted",
    },
    broadcastStarted(
      _ctx,
      { rtcPeerConnection, localMediaStream }: {
        localMediaStream: MediaStream;
        rtcPeerConnection: RTCPeerConnection;
      },
    ) {
      return {
        state: "broadcasting",
        localMediaStream,
        rtcPeerConnection,
      } as const;
    },
  },
});
