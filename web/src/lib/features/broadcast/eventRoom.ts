import { globalState } from "@/lib/globalState";
import { EventRoomMessages } from "backend";
import { PartySocket } from "partysocket";

export let eventWsClient: PartySocket | null = null;

export function initalizeEventRoomPartySocket() {
  if (eventWsClient) {
    throw new Error(
      `EventRoom PartySocket has already been inialized. Unsubcribe (call the retunred function) from the partySocket to inialize it again`,
    );
  }
  const ws = new PartySocket({
    host: "http://localhost:8787",
    party: "event-room",
  });

  ws.addEventListener("message", (message) => {
    const data = message.data;

    if (typeof data !== "string") {
      throw new Error(
        `EventRoom listener expectes Message data to be string datatype`,
      );
    }

    const parsedData = safeParseJson<EventRoomMessages>(
      data,
      `Eventoom listener expects all the data to be valid json. But instead got ${data}`,
    );

    if (parsedData.type === "membershipStatus") {
      globalState.send({
        type: "setEventParticipantStatus",
        newStatus: parsedData.status,
      });
    }
  });

  eventWsClient = ws;

  return () => {
    ws.close();

    eventWsClient = null;
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
