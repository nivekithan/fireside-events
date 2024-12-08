import { AnyActorRef, assign, fromPromise, setup, spawnChild } from "xstate";
import { SignalingServer } from "./signalingServer";
import { getPublicId } from "../identity";
import invariant from "tiny-invariant";

export type BroadcastMachineEvents =
  | { type: "permissionGranted" }
  | { type: "permissionDenied" }
  | { type: "permissionPending" }
  | { type: "rtcAnswer"; sdp: string }
  | { type: "rtcOffer"; sdp: string }
  | { type: "newMediaStream"; mediaStream: MediaStream };

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
        offer: string | null;
      };
      remoteMediaStreams: Array<MediaStream>;
    },
    events: {} as BroadcastMachineEvents,
  },
  actions: {
    logUnhandledEvent: ({ event }) => {
      console.log(`Unhandled Event: `, event);
    },
    setNewMediaStream: assign(({ context }, mediaStream: MediaStream) => {
      return {
        remoteMediaStreams: [...context.remoteMediaStreams, mediaStream],
      };
    }),
    setOffer: assign(({ context }, offer: string) => {
      return { internal: { ...context.internal, offer: offer } };
    }),

    setAnswer: assign(({ context }, answer: string) => {
      return { internal: { ...context.internal, answer } };
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

    sendAnswer: ({ context }, answer: string) => {
      const signalingServer = context.signalingServer;

      invariant(signalingServer, `Expected signaling server to be initalized`);

      signalingServer.regenotiate(answer);
    },
    spawnRemoteTracksListener: assign(
      ({ spawn, self, context }, rtcConnection: RTCPeerConnection) => {
        spawn("listenForNewRemoteTracks", {
          id: "ListenForNewRemoteTracks",
          input: { parentMachine: self, rtcPeerConnection: rtcConnection },
        });

        return context;
      }
    ),
  },
  actors: {
    setOfferToRTCPeerConnection: fromPromise(
      async ({
        input: { offer, rtcPeerConnection },
      }: {
        input: { offer: string; rtcPeerConnection: RTCPeerConnection };
      }) => {
        await rtcPeerConnection.setRemoteDescription(
          new RTCSessionDescription({ type: "offer", sdp: offer })
        );

        const newAnswer = await rtcPeerConnection.createAnswer();

        rtcPeerConnection.setLocalDescription(
          new RTCSessionDescription({ type: "answer", sdp: newAnswer.sdp })
        );

        if (!newAnswer.sdp) {
          throw new Error(`Unable to generate newAnswer`);
        }

        return { newAnswer: { type: "answer", sdp: newAnswer.sdp } };
      }
    ),
    setAnswerToRTCPeerConnection: fromPromise(
      async ({
        input: { answer, rtcPeerConnection },
      }: {
        input: { rtcPeerConnection: RTCPeerConnection; answer: string };
      }) => {
        return rtcPeerConnection.setRemoteDescription(
          new RTCSessionDescription({ type: "answer", sdp: answer })
        );
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

    listenForNewRemoteTracks: fromPromise(
      async ({
        input: { rtcPeerConnection, parentMachine },
        signal,
      }: {
        input: {
          rtcPeerConnection: RTCPeerConnection;
          parentMachine: AnyActorRef;
        };
        signal: AbortSignal;
      }) => {
        function handleNewRemoteTrack(e: RTCTrackEvent) {
          if (e.transceiver.direction !== "recvonly") {
            // Since direction is not recvonly it means the track is not of remote
            // so we can ignore this event
            return;
          }

          const newMediaStream = new MediaStream();

          console.log(
            `Adding new Remote track`,
            "track",
            e.track,
            "transreciver",
            e.transceiver
          );
          newMediaStream.addTrack(e.track);

          parentMachine.send({
            type: "newMediaStream",
            mediaStream: newMediaStream,
          } satisfies BroadcastMachineEvents);
        }

        rtcPeerConnection.addEventListener("track", handleNewRemoteTrack);

        signal.onabort = () => {
          rtcPeerConnection.removeEventListener("track", handleNewRemoteTrack);
        };
      }
    ),
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

        function permissionChangeHandler() {
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
      offer: null,
    },
    remoteMediaStreams: [],
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
        newMediaStream: {
          actions: {
            type: "setNewMediaStream",
            params({ event }) {
              return event.mediaStream;
            },
          },
        },
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
                  type: "spawnRemoteTracksListener",
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
            rtcOffer: {
              actions: {
                type: "setOffer",
                params({ event }) {
                  return event.sdp;
                },
              },
              target: "processingOffer",
            },
          },
        },
        processingOffer: {
          invoke: {
            src: "setOfferToRTCPeerConnection",
            input({ context }) {
              const rtcPeerConnection = context.rtcPeerConnection;
              const offer = context.internal.offer;

              invariant(
                rtcPeerConnection,
                `Expected RTCPeerConnection to be initalized`
              );
              invariant(offer, `Expected offer to be initialized`);

              return { offer, rtcPeerConnection };
            },
            onDone: {
              actions: {
                type: "sendAnswer",
                params({ event }) {
                  return event.output.newAnswer.sdp;
                },
              },
              target: "broadcastingLocalStream",
            },
            onError: {
              target: "unableToProcessOffer",
            },
          },
        },
        processingAnswer: {
          on: {
            rtcOffer: {
              actions: {
                type: "setOffer",
                params({ event }) {
                  return event.sdp;
                },
              },
              target: "processingOffer",
            },
          },
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
        broadcastingLocalStream: {
          on: {
            rtcOffer: {
              actions: {
                type: "setOffer",
                params({ event }) {
                  return event.sdp;
                },
              },
              target: "processingOffer",
            },
          },
        },
        unableToProcessAnswer: {},
        unableToProcessOffer: {},
      },
    },
  },
  on: {
    "*": {
      actions: "logUnhandledEvent",
    },
  },
});

export type BroadcastMachine = typeof broadcastMachine;
