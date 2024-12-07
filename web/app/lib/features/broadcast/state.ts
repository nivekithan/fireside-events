import { AnyActorRef, assign, fromPromise, setup, spawnChild } from "xstate";
import { SignalingServer } from "./signalingServer";
import { getPublicId } from "../identity";
import invariant from "tiny-invariant";

export type BroadcastMachineEvents =
  | { type: "permissionGranted" }
  | { type: "permissionDenied" }
  | { type: "permissionPending" }
  | { type: "rtcAnswer"; sdp: string };

export const broadcastMachine = setup({
  guards: {
    isPermissionGranted: (_, state: PermissionState) => {
      return state === "granted";
    },
    isPermissionDenied: (_, state: PermissionState) => {
      return state === "denied";
    },
    isPermissionPending: (_, state: PermissionState) => {
      return state === "prompt";
    },
  },
  types: {
    context: {} as {
      localMediaStream: null | MediaStream;
      signalingServer: SignalingServer | null;
      rtcPeerConnection: null | RTCPeerConnection;
      internal: {
        answer: string | null;
      };
    },
    events: {} as BroadcastMachineEvents,
  },
  actions: {
    setAnswer: assign((_, answer: string) => {
      return { internal: { answer } };
    }),

    pushLocalTracks(
      { context },
      {
        localOffer,
        transrecivers,
      }: {
        localOffer: RTCLocalSessionDescriptionInit;
        transrecivers: Array<RTCRtpTransceiver>;
      }
    ) {
      const signalingServer = context.signalingServer;
      if (!signalingServer) {
        throw new Error(`Expected Signaling Server to be initalized`);
      }
      signalingServer.pushLocalTrack({
        localOffer: localOffer,
        transreviers: transrecivers,
      });
    },
    assignRtcPeerConnection: assign(
      (_, rtcPeerConnection: RTCPeerConnection) => {
        return { rtcPeerConnection: rtcPeerConnection };
      }
    ),
    updateLocalMediaStream: assign((_, mediaStream: MediaStream) => {
      return { localMediaStream: mediaStream };
    }),

    listenToSignalingServer: assign(({ self }) => {
      const signalingServer = new SignalingServer({
        room: "DEFAULT",
        id: getPublicId(),
        parentMachine: self,
      });

      signalingServer.listen();

      return { signalingServer };
    }),
    stopSignalingServer: assign(({ context }) => {
      if (!context.signalingServer) {
        throw new Error(
          `Calling stopSignalingServer without ever initalizing signaling server`
        );
      }

      context.signalingServer.stop();

      return { signalingServer: null };
    }),
  },
  actors: {
    setAnswerToRTCPeerConnection: fromPromise(
      async ({
        input: { answer, rtcPeerConnection },
      }: {
        input: { rtcPeerConnection: RTCPeerConnection; answer: string };
      }) => {
        return rtcPeerConnection.setRemoteDescription({
          type: "answer",
          sdp: answer,
        });
      }
    ),
    getPermissionStatus: fromPromise(async () => {
      const permissionStatus = await navigator.permissions.query({
        name: "camera" as any,
      });

      return permissionStatus.state;
    }),

    askForPermission: fromPromise(async () => {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      return mediaStream;
    }),

    getMediaStream: fromPromise(async () => {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      return mediaStream;
    }),

    listenForPermissionChange: fromPromise(
      async ({
        signal,
        input: { parentMachine },
      }: {
        input: { parentMachine: AnyActorRef };
        signal: AbortSignal;
      }) => {
        const permissionStatus = await navigator.permissions.query({
          name: "camera" as any,
        });

        console.log(`Listen for permission change: ${permissionStatus.state}`);

        function permissionChangeHandler() {
          console.log(`Change in permission: ${permissionStatus.state}`);
          if (permissionStatus.state === "prompt") {
            parentMachine.send({
              type: "permissionPending",
            } satisfies BroadcastMachineEvents);
          } else if (permissionStatus.state === "denied") {
            parentMachine.send({
              type: "permissionDenied",
            } satisfies BroadcastMachineEvents);
          } else if (permissionStatus.state === "granted") {
            parentMachine.send({
              type: "permissionGranted",
            } satisfies BroadcastMachineEvents);
          }
        }

        permissionStatus.addEventListener("change", permissionChangeHandler);

        signal.onabort = () => {
          console.log(`Stopping to listen for permission change`);
          permissionStatus.removeEventListener(
            "change",
            permissionChangeHandler
          );
        };

        return permissionStatus;
      }
    ),

    broadcastLocalMediaStream: fromPromise(
      async ({ input }: { input: { mediaStream: MediaStream } }) => {
        const localMediaStream = input.mediaStream;

        const rtcConnection = new RTCPeerConnection({
          iceServers: [
            {
              urls: "stun:stun.cloudflare.com:3478",
            },
          ],
          bundlePolicy: "max-bundle",
        });

        const transrecivers = localMediaStream.getTracks().map((t) => {
          return rtcConnection.addTransceiver(t, { direction: "sendonly" });
        });

        const localOffer = await rtcConnection.createOffer();

        await rtcConnection.setLocalDescription(localOffer);

        return { localOffer, rtcConnection, transrecivers };
      }
    ),
  },
}).createMachine({
  id: "broadcast",
  initial: "determiningPermission",
  context: {
    localMediaStream: null,
    signalingServer: null,
    rtcPeerConnection: null,
    internal: {
      answer: null,
    },
  },

  states: {
    determiningPermission: {
      entry: spawnChild("listenForPermissionChange", {
        id: "permissionChangeListener",
        input({ self }) {
          return { parentMachine: self };
        },
      }),
      invoke: {
        src: "getPermissionStatus",
        onDone: [
          {
            guard: {
              type: "isPermissionGranted",
              params({ event }) {
                return event.output;
              },
            },
            target: "permissionGranted",
          },
          {
            guard: {
              type: "isPermissionDenied",
              params({ event }) {
                return event.output;
              },
            },
            target: "permissionDenied",
          },
          {
            guard: {
              type: "isPermissionPending",
              params({ event }) {
                return event.output;
              },
            },
            target: "permissionPending",
          },
        ],
        onError: "unableToDeterminePermission",
      },
    },
    permissionGranted: {
      on: {
        permissionPending: "permissionPending",
        permissionDenied: "permissionDenied",
      },
      invoke: {
        src: "getMediaStream",
        onDone: {
          actions: {
            type: "updateLocalMediaStream",
            params({ event }) {
              return event.output;
            },
          },
          target: "broadcasting",
        },
        onError: {
          target: "unableToGetMediaStream",
        },
      },
    },
    unableToGetMediaStream: {
      on: {
        permissionDenied: "permissionDenied",
        permissionPending: "permissionPending",
        permissionGranted: "permissionGranted",
      },
    },
    permissionDenied: {
      on: {
        permissionPending: "permissionPending",
        permissionGranted: "permissionGranted",
      },
    },
    permissionPending: {
      on: {
        permissionDenied: "permissionDenied",
        permissionGranted: "permissionGranted",
      },
      invoke: {
        src: "askForPermission",
        onDone: {
          target: "broadcasting",
          actions: {
            type: "updateLocalMediaStream",
            params({ event }) {
              return event.output;
            },
          },
        },
        onError: {
          target: "permissionDenied",
        },
      },
    },
    unableToDeterminePermission: {
      on: {
        permissionDenied: "permissionDenied",
        permissionPending: "permissionPending",
        permissionGranted: "permissionGranted",
      },
    },
    broadcasting: {
      entry: ["listenToSignalingServer"],
      exit: ["stopSignalingServer"],
      on: {
        permissionDenied: "permissionDenied",
        permissionPending: "permissionPending",
      },
      initial: "creatingOffer",
      states: {
        creatingOffer: {
          invoke: {
            src: "broadcastLocalMediaStream",
            input: ({ context }) => {
              if (!context.localMediaStream) {
                throw new Error(`Expected localMediaStream to be initialized`);
              }

              return { mediaStream: context.localMediaStream };
            },
            onDone: {
              actions: [
                {
                  type: "assignRtcPeerConnection",
                  params({ event }) {
                    return event.output.rtcConnection;
                  },
                },
                {
                  type: "pushLocalTracks",
                  params({ event }) {
                    return {
                      localOffer: event.output.localOffer,
                      transrecivers: event.output.transrecivers,
                    };
                  },
                },
              ],
              target: "waitingForReply",
            },
            onError: {
              target: "unableToCreateOffer",
            },
          },
        },
        unableToCreateOffer: {},
        waitingForReply: {
          on: {
            rtcAnswer: {
              actions: {
                type: "setAnswer",
                params({ event }) {
                  return event.sdp;
                },
              },
              target: "processingAnswer",
            },
          },
        },
        processingAnswer: {
          invoke: {
            src: "setAnswerToRTCPeerConnection",
            input({ context }) {
              invariant(
                context.rtcPeerConnection,
                "Expected RTCPeerConnection to be initialised"
              );
              invariant(
                context.internal.answer,
                "Expected internal.answer to be set"
              );
              return {
                rtcPeerConnection: context.rtcPeerConnection,
                answer: context.internal.answer,
              };
            },
            onDone: {
              target: "broadcastingLocalStream",
            },
            onError: {
              target: "unableToProcessAnswer",
            },
          },
        },
        broadcastingLocalStream: {},
        unableToProcessAnswer: {},
      },
    },
  },
});

export type BroadcastMachine = typeof broadcastMachine;
