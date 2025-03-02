import { AnyActorRef, assign, fromPromise, setup, spawnChild } from "xstate";
import invariant from "tiny-invariant";
import {
  createNewSession,
  getOtherPeersLocalTracks,
  pushLocalTracks,
  pushRemoteTracks,
  removeRemoteTracks,
  renegotiateSession,
} from "./calls";
import { Signaling } from "./signaling";
import { callsTracer, makeParentSpanCtx } from "~/lib/traces/trace.client";
import { addNewTransreciver, createNewRtcConnection } from "./rtc";

export type BroadcastMachineEvents =
  | { type: "permissionGranted" }
  | { type: "permissionDenied" }
  | { type: "permissionPending" }
  | {
      type: "newMediaStream";
      mediaStream: { mediaStream: MediaStream; trackMids: string[] };
    }
  | {
      type: "poke";
    }
  | { type: "pauseVideo" }
  | { type: "broadcastVideo" };

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
    isRoomInSync: ({ context }) => {
      const signaling = context.signaling;

      invariant(signaling, `Expected signaling to be initialized`);

      return context.roomVersion === signaling.version;
    },
  },
  types: {
    context: {} as {
      localMediaStream: null | MediaStream;
      rtcPeerConnection: null | RTCPeerConnection;
      sessionIdentityToken: string | null;
      signaling: Signaling | null;
      remoteMediaStreams: Array<{
        mediaStream: MediaStream;
        trackMids: string[];
      }>;
      roomVersion: number;
    },
    events: {} as BroadcastMachineEvents,
  },
  actions: {
    toggleLocalVideo: ({ context }) => {
      const localMediaStream = context.localMediaStream;

      invariant(
        localMediaStream,
        `Expected local media stream to be defined before calling toggleLocalVideo`
      );

      localMediaStream.getTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
    },

    spawnSignalingListener: assign(({ self, context }) => {
      const previousSignaling = context.signaling;

      if (previousSignaling) {
        console.warn(`Signaling listener already exists. Skipping`);
        return { ...context };
      }

      const room = Signaling.DEFAULT_ROOM;
      const signalingListener = new Signaling({ room, machineRef: self });

      return { signaling: signalingListener };
    }),

    connectToSignalingServer: ({ context }) => {
      const signaling = context.signaling;
      const sessionIdentityToken = context.sessionIdentityToken;

      invariant(signaling, `Expected signaling to be initialized`);
      invariant(
        sessionIdentityToken,
        `Expected sessionIdentityToken to be initialized`
      );

      signaling.connect(sessionIdentityToken);
    },

    stopSignalingListener: assign(({ context }) => {
      const signaling = context.signaling;

      if (!signaling) {
        return { ...context };
      }

      signaling.disconnect();

      return { signaling: null };
    }),

    logUnhandledEvent: ({ event }) => {
      console.log(`Unhandled Event: `, event);
    },

    assignNewRemoteMediaStream: assign(
      (
        { context },
        mediaStream: { mediaStream: MediaStream; trackMids: string[] }
      ) => {
        return {
          remoteMediaStreams: [...context.remoteMediaStreams, mediaStream],
        };
      }
    ),
    assignRtcPeerConnection: assign(
      (_, rtcPeerConnection: RTCPeerConnection) => {
        return { rtcPeerConnection: rtcPeerConnection };
      }
    ),

    assignSessionIdentityToken: assign((_, sessionIdentityToken: string) => {
      return { sessionIdentityToken };
    }),

    assignLocalMediaStream: assign((_, mediaStream: MediaStream) => {
      return { localMediaStream: mediaStream };
    }),
    assignNewRoomVersion: assign((_, version: number) => {
      return { roomVersion: version };
    }),

    spawnRemoteTracksListener: assign(
      ({ spawn, self, context }, rtcConnection: RTCPeerConnection) => {
        spawn("listenForNewRemoteTracks", {
          id: "ListenForNewRemoteTracks",
          input: { parentMachine: self, rtcPeerConnection: rtcConnection },
        });

        return context;
      }
    ),
    stopTransrecvicer({ context }, mId: string) {
      const rtcPeerConnection = context.rtcPeerConnection;

      invariant(
        rtcPeerConnection,
        `Expected RTCPeerConnection to be initalized`
      );

      const transreciver = rtcPeerConnection.getTransceivers().find((t) => {
        return t.mid === mId;
      });

      if (!transreciver) {
        throw new Error(`Expected transreciver to be found`);
      }

      transreciver.stop();
      console.log(`Stopped transreciver with mId: ${mId}`);
    },
  },
  actors: {
    getPermissionStatus: fromPromise(async () => {
      const cameraPermissionStatus = await navigator.permissions.query({
        name: "camera" as any,
      });

      return cameraPermissionStatus.state;
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
          console.log("New track event");
          if (e.transceiver.direction !== "recvonly") {
            // Since direction is not recvonly it means the track is not of remote
            // so we can ignore this event
            return;
          }

          const newMediaStream = new MediaStream();
          const mId = e.transceiver.mid;

          if (!mId) {
            throw new Error(`There is no mid to idenitfy the transreciver`);
          }

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
            mediaStream: { mediaStream: newMediaStream, trackMids: [mId] },
          } satisfies BroadcastMachineEvents);
        }

        function onNegotiationNeeded() {
          console.log("Negotiation needed");
        }

        rtcPeerConnection.addEventListener("track", handleNewRemoteTrack);
        rtcPeerConnection.addEventListener(
          "negotiationneeded",
          onNegotiationNeeded
        );

        signal.onabort = () => {
          rtcPeerConnection.removeEventListener("track", handleNewRemoteTrack);
          rtcPeerConnection.removeEventListener(
            "negotiationneeded",
            onNegotiationNeeded
          );
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
        return await callsTracer.startActiveSpan(
          "broadcastLocalMediaStream",
          async (rootSpan) => {
            const ctx = makeParentSpanCtx(rootSpan);
            const sessionIdentityToken = await createNewSession({
              ctx: ctx,
            });

            const localMediaStream = input.mediaStream;
            const rtcConnection = createNewRtcConnection();

            const { sdp, tracks, transrecivers } = await addNewTransreciver({
              mediaStream: localMediaStream,
              rtcConnection,
              ctx: ctx,
            });

            const pushLocalTracksData = await pushLocalTracks({
              sdp,
              sessionIdentityToken,
              tracks,
              ctx,
            });

            if (!pushLocalTracksData) {
              throw new Error(
                `Expected data to be returned from pushLocalTracks`
              );
            }

            const answerSdp = pushLocalTracksData.sessionDescription?.sdp;

            if (!answerSdp) {
              throw new Error(`Expected answer sdp to be returned`);
            }

            await rtcConnection.setRemoteDescription({
              type: "answer",
              sdp: answerSdp,
            });

            rootSpan.end();

            return {
              sessionIdentityToken,
              rtcConnection,
              transrecivers,
            };
          }
        );
      }
    ),

    syncWithRoom: fromPromise(
      async ({
        input: {
          sessionIdentityToken,
          rtcPeerConnection,
          signlaing,
          currentRoomVersion,
        },
      }: {
        input: {
          sessionIdentityToken: string;
          rtcPeerConnection: RTCPeerConnection;
          signlaing: Signaling;
          currentRoomVersion: number;
        };
      }) => {
        return await callsTracer.startActiveSpan(
          "syncWithRoom",
          async (span) => {
            try {
              const { remoteTracks, version } = await getOtherPeersLocalTracks({
                ctx: makeParentSpanCtx(span),
                sessionIdentityToken: sessionIdentityToken,
              });

              if (currentRoomVersion === version) {
                console.info(`Room is already in sync`);
                return { version };
              }

              const { toAdd, toRemove } = signlaing.findDiff({
                final: remoteTracks,
              });

              if (toAdd.length !== 0) {
                span.addEvent("adding new tracks", {
                  tracksLength: toAdd.length,
                });

                const { tracks: successfullyPushedTracks, sessionDescription } =
                  await pushRemoteTracks({
                    sessionIdentityToken,
                    tracks: toAdd.map((t) => ({
                      name: t.name,
                      remoteSessionId: t.sessionId,
                    })),
                    ctx: makeParentSpanCtx(span),
                  });

                signlaing.syncedTracks.push(...successfullyPushedTracks);

                await rtcPeerConnection.setRemoteDescription({
                  sdp: sessionDescription.sdp,
                  type: sessionDescription.type,
                });

                console.count("Sync With Room");
                const answer = await rtcPeerConnection.createAnswer();

                await rtcPeerConnection.setLocalDescription(answer);

                if (!answer.sdp || answer.type !== "answer") {
                  throw new Error(
                    `[UNREACHABLE] Expected answer to be generated`
                  );
                }

                await renegotiateSession({
                  ctx: makeParentSpanCtx(span),
                  sessionDescription: { sdp: answer.sdp, type: answer.type },
                  sessionIdentityToken,
                });
              }

              if (toRemove.length !== 0) {
                span.addEvent("removing tracks", {
                  tracksLength: toRemove.length,
                });

                rtcPeerConnection.getTransceivers().forEach((t) => {
                  const isTransreciverStopped = Boolean(
                    toRemove.find((r) => r.mid === t.mid)
                  );

                  if (isTransreciverStopped) {
                    t.stop();
                  }
                });

                const offer = await rtcPeerConnection.createOffer();

                invariant(offer.sdp, `Expected offer sdp to be generated`);

                await rtcPeerConnection.setLocalDescription(offer);

                const removeTracksResponse = await removeRemoteTracks({
                  tracks: toRemove,
                  sessionIdentityToken,
                  sessionDescription: { sdp: offer.sdp, type: "offer" },
                  ctx: makeParentSpanCtx(span),
                });

                console.log(`Remove tracks response`, removeTracksResponse);

                const answer = removeTracksResponse?.sessionDescription;

                invariant(
                  answer,
                  `remove tracks response should have sessionDescription`
                );
                invariant(answer.sdp, `Expected answer sdp to be defined`);

                await rtcPeerConnection.setRemoteDescription({
                  sdp: answer.sdp,
                  type: "answer",
                });

                signlaing.syncedTracks = signlaing.syncedTracks.filter(
                  (t) => !toRemove.find((r) => r.mid === t.mid)
                );
              }

              return { version };
            } finally {
              span.end();
            }
          }
        );
      }
    ),
  },
}).createMachine({
  id: "broadcast",
  initial: "determiningPermission",
  context: {
    signaling: null,
    localMediaStream: null,
    sessionIdentityToken: null,
    rtcPeerConnection: null,
    roomVersion: -Infinity,
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
            type: "assignLocalMediaStream",
            params({ event }) {
              return event.output;
            },
          },
          target: "joiningRoom",
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
          target: "joiningRoom",
          actions: {
            type: "assignLocalMediaStream",
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
    joiningRoom: {
      invoke: {
        src: "broadcastLocalMediaStream",
        input: ({ context }) => {
          const localMediaStream = context.localMediaStream;

          invariant(
            localMediaStream,
            `Expected localMediaStream to be defined before entering joiningRoom state`
          );

          return { mediaStream: localMediaStream };
        },
        onDone: {
          target: "broadcasting",
          actions: [
            {
              type: "assignRtcPeerConnection",
              params({ event }) {
                return event.output.rtcConnection;
              },
            },
            {
              type: "assignSessionIdentityToken",
              params({ event }) {
                return event.output.sessionIdentityToken;
              },
            },
          ],
        },
      },
    },
    broadcasting: {
      type: "parallel",
      states: {
        localTracks: {
          initial: "broadcastVideo",
          states: {
            broadcastVideo: {
              on: {
                pauseVideo: {
                  actions: "toggleLocalVideo",
                  target: "pauseVideo",
                },
              },
            },
            pauseVideo: {
              on: {
                broadcastVideo: {
                  actions: "toggleLocalVideo",
                  target: "broadcastVideo",
                },
              },
            },
          },
        },
        remoteTracks: {},
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
