import { PartySocket } from "partysocket";

export class SignalingServer {
  // #room: string;
  // #id: string;
  #partySocket: PartySocket;

  #messageHandler: null | ((message: MessageEvent<unknown>) => void) = null;

  constructor({ room, id }: { id: string; room: string }) {
    // this.#room = room;
    // this.#id = id;

    this.#partySocket = new PartySocket({
      id: id,
      host: "localhost:8787",
      party: "event-room",
      room: room,
    });
  }

  listen() {
    if (this.#messageHandler) {
      console.log(`Already listening to the messages`);
      return;
    }

    function handleMessage(message: MessageEvent<unknown>) {
    }

    this.#partySocket.addEventListener("message", handleMessage);

    this.#messageHandler = handleMessage;
  }

  stop() {
    const messageHandler = this.#messageHandler;
    if (!messageHandler) {
      console.error(
        `We are not listening to the messages, so there is nothing to stop`,
      );
      return;
    }

    this.#partySocket.removeEventListener("message", messageHandler);
  }
}
