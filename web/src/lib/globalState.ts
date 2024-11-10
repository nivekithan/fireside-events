import { createStore } from "@xstate/store";

export const globalState = createStore({
  context: { sessionId: "" },
  on: {
    newSessionId(ctx, sessionId: string) {
      return { sessionId: sessionId };
    },
  },
});
