import { PartySocket } from "partysocket";
import { safeJsonParse } from "~/lib/neverthrow/json";
import { ClientSentMessage, parseServerSentMessages } from "signaling-messages";
import { AnyActorRef } from "xstate";
import { BroadcastMachineEvents } from "./state";
import invariant from "tiny-invariant";

export type SignalingTracks = { name: string; sessionId: string; mid: string };

export class Signaling {
  static DEFAULT_ROOM = "DEFAULT";
  #room: string;
  #sessionIdentityToken: string | null = null;
  #partySocket: PartySocket | null = null;
  #machineRef: AnyActorRef;

  version = -Infinity;
  syncedTracks: Array<SignalingTracks> = [];

  constructor({ room, machineRef }: { room: string; machineRef: AnyActorRef }) {
    this.#room = room;
    this.#machineRef = machineRef;
  }

  connect(sessionIdentityToken: string) {
    this.#sessionIdentityToken = sessionIdentityToken;

    const partySocket = new PartySocket({
      host: import.meta.env.VITE_SIGNALING_SERVER_HOST,
      room: this.#room,
      party: "room-manager",
      id: this.#sessionIdentityToken,
    });

    partySocket.addEventListener("message", (e) => {
      const message = e.data;

      if (!message || typeof message !== "string") {
        console.warn(
          `[Signalling] received message in invalid format: ${message}`
        );
        return;
      }

      const parsedMessage = safeJsonParse(message);

      const data = parsedMessage.andThen(parseServerSentMessages);

      if (data.isErr()) {
        console.warn(
          `[Signalling] received message in invalid format: ${data.error}`
        );
        return;
      }

      const payload = data.value.data;
      console.log(`[Signalling] received message: ${JSON.stringify(payload)}`);

      if (payload.type === "poke") {
        console.log({ paylodVersion: payload.version });
        this.version = Math.max(this.version, payload.version);
        this.#sendEventToParentMachine({ type: "poke" });
      } else if (payload.type === "resume_remote_video") {
        this.#sendEventToParentMachine(payload);
      } else if (payload.type === "pause_remote_video") {
        this.#sendEventToParentMachine(payload);
      } else {
        // @ts-expect-error This code should never be execuated
        throw new Error(`[UNKNOWN] Message from server: ${payload.type}`);
      }
    });

    this.#partySocket = partySocket;
  }

  findDiff({ final }: { final: Array<Omit<SignalingTracks, "mid">> }) {
    const current = this.syncedTracks;
    // Create sets of names for efficient lookup
    const finalNames = new Set(final.map((item) => item.name));
    const currentNames = new Set(current.map((item) => item.name));

    // Find items to add (in final but not in current)
    const toAdd = final.filter((item) => !currentNames.has(item.name));

    // Find items to remove (in current but not in final)
    const toRemove = current.filter((item) => !finalNames.has(item.name));

    return {
      toAdd,
      toRemove,
    };
  }

  disconnect() {
    if (!this.#partySocket) {
      console.warn(`[Signalling] disconnect called without a connection`);
      return;
    }

    this.#partySocket.close();
    this.#partySocket = null;
  }

  send(message: ClientSentMessage) {
    invariant(this.#partySocket, "Party socket is not yet defined");

    this.#partySocket.send(JSON.stringify(message));
  }

  #sendEventToParentMachine(event: BroadcastMachineEvents) {
    this.#machineRef.send(event);
  }
}
