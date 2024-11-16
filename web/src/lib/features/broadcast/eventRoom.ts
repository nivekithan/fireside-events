import { globalState } from "@/lib/globalState";
import { EventRoomServerMessages } from "backend";
import { PartySocket } from "partysocket";

export function initalizeEventRoomPartySocket() {
  const currentState = globalState.getSnapshot();

  if (currentState.context.event.ws) {
    throw new Error(
      `Event ws client already been established. You will have to call unsubscribe (function which got returned when calling initalizeEventRoomPartySocket) before calling initalizeEventRoomPartySocket`,
    );
  }
  const ws = new PartySocket({
    host: "http://localhost:8787",
    party: "event-room",
    room: "DEFAULT_ROOM",
  });

  globalState.send({ type: "eventWsInitalized", ws: ws });

  ws.addEventListener("message", (message) => {
    const data = message.data;

    if (typeof data !== "string") {
      throw new Error(
        `EventRoom listener expectes Message data to be string datatype`,
      );
    }

    const parsedData = safeParseJson<EventRoomServerMessages>(
      data,
      `Eventoom listener expects all the data to be valid json. But instead got ${data}`,
    );

    if (parsedData.type === "membershipStatus") {
      globalState.send({
        type: "eventParticipantUpdate",
        newStatus: parsedData.status,
      });
    }
  });

  return () => {
    ws.close();

    globalState.send({ type: "eventWsDestroyed" });
  };
}

function safeParseJson<T = unknown>(data: string, error: string) {
  try {
    const parsedData = JSON.parse(data);

    return parsedData as T;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    throw new Error(
      error,
    );
  }
}
