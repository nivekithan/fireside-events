import { createStore } from "@xstate/store";
import { EventRoomMessages } from "backend";

type StoreState = {
  sessionId: string | null;
  eventParticipantStatus: EventRoomMessages["status"] | null;
};

const StoreInitialContext: StoreState = {
  sessionId: null,
  eventParticipantStatus: null,
};

export const globalState = createStore({
  context: StoreInitialContext,
  on: {
    newSessionId(ctx, { sessionId }: { sessionId: string }) {
      return { sessionId: sessionId };
    },

    setEventParticipantStatus(
      ctx,
      { newStatus }: { newStatus: EventRoomMessages["status"] },
    ) {
      return { eventParticipantStatus: newStatus };
    },
  },
});
