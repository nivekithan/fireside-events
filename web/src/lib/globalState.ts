import { createStore } from "@xstate/store";
import { EventRoomServerMessages } from "backend";
import PartySocket from "partysocket";

type StoreState = {
  sessionId: string | null;
  event: {
    participantStatus: EventRoomServerMessages["status"] | null;
    ws: PartySocket | null;
  };
};

const StoreInitialContext: StoreState = {
  sessionId: null,
  event: {
    participantStatus: null,
    ws: null,
  },
};

export const globalState = createStore({
  context: StoreInitialContext,
  on: {
    newSessionId(_ctx, { sessionId }: { sessionId: string }) {
      return { sessionId: sessionId };
    },

    eventParticipantUpdate(
      ctx,
      { newStatus }: { newStatus: EventRoomMessages["status"] },
    ) {
      return { event: { participantStatus: newStatus, ws: ctx.event.ws } };
    },

    eventWsInitalized(ctx, { ws }: { ws: PartySocket }) {
      return { event: { ws, participantStatus: ctx.event.participantStatus } };
    },

    eventWsDestroyed(_ctx) {
      return { event: { ws: null, participantStatus: null } };
    },
  },
});
