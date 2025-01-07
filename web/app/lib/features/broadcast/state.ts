import { AnyActorRef, assign, fromPromise, setup, spawnChild } from "xstate";
import { getPublicId } from "../identity";
import invariant from "tiny-invariant";
import { bk } from "../bk";
import { pushRemoteTracks, removeRemoteTracks } from "./calls";
import { Signaling } from "./signaling";

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
    };

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
      internal: {
        answer: string | null;
        offer: string | null;
      };
      remoteMediaStreams: Array<{
        mediaStream: MediaStream;
        trackMids: string[];
      }>;
      roomVersion: number;
    },
    events: {} as BroadcastMachineEvents,
  },
  actions: {
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
        const sessionIdentityTokenRes = await bk.calls.sessions.new.$post({
          json: {
            userSessionId: getPublicId(),
            room: "DEFAULT",
          },
        });

        const sessionIdentityToken = (await sessionIdentityTokenRes.json()).data
          .sessionIdentityToken;

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

        const pushLocalTracksRes = await bk.calls.tracks.new.$post({
          header: { "x-session-identity-token": sessionIdentityToken },
          json: {
            sessionDescription: { type: "offer", sdp: sdp },
            tracks: tracks,
          },
        });

        const pushLocalTracksData = await pushLocalTracksRes.json();

        if (!pushLocalTracksData.data) {
          throw new Error(`Expected data to be returned from pushLocalTracks`);
        }

        const answerSdp = pushLocalTracksData.data.sessionDescription?.sdp;

        if (!answerSdp) {
          throw new Error(`Expected answer sdp to be returned`);
        }

        await rtcConnection.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });

        return { sessionIdentityToken, rtcConnection, transrecivers };
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
        const res = await bk.calls.local_tracks.$get({
          header: { "x-session-identity-token": sessionIdentityToken },
        });

        const {
          data: { tracks: remoteTracks, version },
        } = await res.json();

        if (currentRoomVersion === version) {
          console.info(`Room is already in sync`);
          return { version };
        }

        const { toAdd, toRemove } = signlaing.findDiff({ final: remoteTracks });

        console.log({ toRemove });
        // TODO: Handle toRemove

        if (toAdd.length !== 0) {
          const pushRemoteTracksRes = await pushRemoteTracks({
            sessionIdentityToken,
            tracks: toAdd.map((t) => ({
              name: t.name,
              remoteSessionId: t.sessionId,
            })),
          });

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
          signlaing.syncedTracks.push(...sucessfullyPushedTracks);

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

          await rtcPeerConnection.setRemoteDescription({ sdp, type });

          console.count("Sync With Room");
          const answer = await rtcPeerConnection.createAnswer();

          await rtcPeerConnection.setLocalDescription(answer);

          if (!answer.sdp || answer.type !== "answer") {
            throw new Error(`[UNREACHABLE] Expected answer to be generated`);
          }

          const regenotiateRes = await bk.calls.sessions.renegotiate.$put({
            header: { "x-session-identity-token": sessionIdentityToken },
            json: {
              sessionDescription: { sdp: answer.sdp, type: answer.type },
            },
          });

          const regenotiateData = await regenotiateRes.json();

          console.log(`Regneotiate Respone data`, regenotiateData);
        }

        if (toRemove.length !== 0) {
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
            type: "assignLocalMediaStream",
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
    broadcasting: {
      entry: [{ type: "spawnSignalingListener" }],
      exit: [{ type: "stopSignalingListener" }],
      on: {
        permissionDenied: "permissionDenied",
        permissionPending: "permissionPending",

        newMediaStream: {
          actions: {
            type: "assignNewRemoteMediaStream",
            params({ event }) {
              return event.mediaStream;
            },
          },
        },
      },
      initial: "joiningRoom",
      states: {
        joiningRoom: {
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
                  type: "assignSessionIdentityToken",
                  params({ event }) {
                    return event.output.sessionIdentityToken;
                  },
                },
                {
                  type: "connectToSignalingServer",
                },
                {
                  type: "spawnRemoteTracksListener",
                  params({ event }) {
                    return event.output.rtcConnection;
                  },
                },
              ],
              target: "syncWithRoom",
            },
            onError: {
              target: "unableToJoinRoom",
              actions: ({ event }) => {
                console.log(`Error while joining room`, event.error);
              },
            },
          },
        },
        unableToJoinRoom: {},
        syncWithRoom: {
          invoke: {
            src: "syncWithRoom",
            input: ({ context }) => {
              const rtcPeerConnection = context.rtcPeerConnection;
              const sessionIdentityToken = context.sessionIdentityToken;
              const signaling = context.signaling;

              invariant(
                rtcPeerConnection,
                `Expected RTCPeerConnection to be initialized`
              );
              invariant(
                sessionIdentityToken,
                `Expected sessionIdentityToken to be initialized`
              );
              invariant(signaling, `Expected signaling to be initialized`);
              return {
                rtcPeerConnection: rtcPeerConnection,
                sessionIdentityToken: sessionIdentityToken,
                signlaing: signaling,
                currentRoomVersion: context.roomVersion,
              };
            },
            onDone: [
              {
                guard: {
                  type: "isRoomInSync",
                },
                target: "joinedRoom",
                actions: [
                  {
                    type: "assignNewRoomVersion",
                    params({ event }) {
                      return event.output.version;
                    },
                  },
                ],
              },
              {
                target: "syncWithRoom",
                reenter: true,
                actions: [
                  {
                    type: "assignNewRoomVersion",
                    params({ event }) {
                      return event.output.version;
                    },
                  },
                ],
              },
            ],
            onError: {
              target: "unableToJoinRoom",
              actions: ({ event }) => {
                console.warn(`Error while sync with room`, event.error);
              },
            },
          },
        },
        joinedRoom: {
          on: {
            poke: [
              {
                guard: "isRoomInSync",
                target: "joinedRoom",
              },
              {
                target: "syncWithRoom",
              },
            ],
          },
        },
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
