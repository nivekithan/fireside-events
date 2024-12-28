import { PartySocket } from "partysocket";
import { ClientSentMessage, ServerSentMessages } from "signaling-messages";
import { AnyActorRef } from "xstate";
import type { BroadcastMachineEvents } from "./state";

export class SignalingServer {
  // #room: string;
  // #id: string;
  #partySocket: PartySocket;
  #messageHandler: null | ((message: MessageEvent<unknown>) => void) = null;
  #parentMachine: AnyActorRef;

  constructor({
    room,
    id,
    parentMachine,
  }: {
    id: string;
    room: string;
    parentMachine: AnyActorRef;
  }) {
    // this.#room = room;
    // this.#id = id;
    this.#parentMachine = parentMachine;

    this.#partySocket = new PartySocket({
      id: id,
      host: import.meta.env.VITE_SIGNALING_SERVER_HOST,
      party: "signal",
      room: room,
    });
  }

  listen() {
    if (this.#messageHandler) {
      console.log(`Already listening to the messages`);
      return;
    }

    const messageHandler = this.#handleMessage();

    this.#partySocket.addEventListener("message", messageHandler);

    this.#messageHandler = messageHandler;
  }

  #handleMessage() {
    return (message: MessageEvent<unknown>) => {
      const data = message.data;

      if (typeof data !== "string") {
        throw new Error(
          `[Signalling Server] Unknown message data: expected string but got ${typeof data}`
        );
      }

      const parsedMessage = ServerSentMessages.parse(JSON.parse(data));

      if (parsedMessage.type === "rtcAnswer") {
        this.#sendEvent({ type: "rtcAnswer", sdp: parsedMessage.sdp });
      } else if (parsedMessage.type === "rtcOffer") {
        this.#sendEvent({ type: "rtcOffer", sdp: parsedMessage.sdp });
      } else if (parsedMessage.type === "removeTrack") {
        this.#sendEvent({ type: "removeTrack", mId: parsedMessage.mId });
      }
    };
  }

  regenotiate(answer: string) {
    this.#sendMessage({ type: "rtcAnswer", sdp: answer });
  }

  pushLocalTrack({
    localOffer,
    transreviers,
  }: {
    localOffer: RTCLocalSessionDescriptionInit;
    transreviers: Array<RTCRtpTransceiver>;
  }) {
    if (!localOffer.sdp) {
      throw new Error(
        `Push Local track expectes localOffer.sdp to be defined but got undefined`
      );
    }

    this.#sendMessage({
      sdp: localOffer.sdp,
      type: "pushTrack",
      tracks: transreviers.map((t) => {
        const trackName = t.sender.track?.id;

        if (!trackName) {
          throw new Error(
            `Expected t.sender.track.id to be present but got undefined`
          );
        }

        if (!t.mid) {
          throw new Error(`Expected mId to be present but got null`);
        }

        return { mId: t.mid, name: trackName };
      }),
    });
  }

  stop() {
    const messageHandler = this.#messageHandler;
    if (!messageHandler) {
      console.error(
        `We are not listening to the messages, so there is nothing to stop`
      );
      return;
    }

    this.#partySocket.removeEventListener("message", messageHandler);
    this.#messageHandler = null;
    this.#partySocket.close();
  }

  #sendEvent(event: BroadcastMachineEvents) {
    this.#parentMachine.send(event);
  }

  #sendMessage(message: ClientSentMessage) {
    this.#partySocket.send(JSON.stringify(message));
  }
}
