import { assign, fromPromise, setup, spawnChild } from "xstate";
import { SignalingServer } from "./signalingServer";
import { getPublicId } from "../identity";

export const broadcastMachine = setup({
  guards: {
    "isPermissionGranted": (_, state: PermissionState) => {
      return state === "granted";
    },
    "isPermissionDenied": (_, state: PermissionState) => {
      return state === "denied";
    },
    "isPermissionPending": (_, state: PermissionState) => {
      return state === "prompt";
    },
  },
  types: {
    context: {} as {
      localMediaStream: null | MediaStream;
      signalingServer: SignalingServer | null;
    },
    events: {} as
      | { type: "permissionGranted" }
      | { type: "permissionDenied" }
      | { type: "permissionPending" },
  },
  actions: {
    updateLocalMediaStream: (_, mediaStream: MediaStream) => {
      return assign({ localMediaStream1: mediaStream });
    },
    listenToSignalingServer: () => {
      const signalingServer = new SignalingServer({
        room: "DEFAULT",
        id: getPublicId(),
      });

      signalingServer.listen();

      return assign({ signalingServer });
    },
    stopSignalingServer: ({ context }) => {
      if (!context.signalingServer) {
        throw new Error(
          `Calling stopSignalingServer without ever initalizing signaling server`,
        );
      }

      context.signalingServer.stop();

      return assign({ signalingServer: null });
    },
  },
  actors: {
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

    listenForPermissionChange: fromPromise(async ({ signal, self }) => {
      const permissionStatus = await navigator.permissions.query({
        name: "camera" as any,
      });

      function permissionChangeHandler() {
        if (permissionStatus.state === "prompt") {
          self.send({ type: "permissionPending" });
        } else if (permissionStatus.state === "denied") {
          self.send({ type: "permissionDenied" });
        } else if (permissionStatus.state === "granted") {
          self.send({ type: "permissionGranted" });
        }
      }

      permissionStatus.addEventListener("change", permissionChangeHandler);

      signal.onabort = () => {
        permissionStatus.removeEventListener("change", permissionChangeHandler);
      };

      return permissionStatus;
    }),
  },
}).createMachine({
  id: "broadcast",
  initial: "determiningPermission",
  context: { localMediaStream: null, signalingServer: null },

  states: {
    determiningPermission: {
      entry: spawnChild("listenForPermissionChange", {
        id: "permissionChangeListener",
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
      on: {
        permissionDenied: "permissionDenied",
        permissionPending: "permissionPending",
      },
      initial: "creatingOffer",
      states: {
        creatingOffer: {},
        waitingForReply: {},
      },
    },
  },
});
