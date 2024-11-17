import { hc } from "hono/client";
import type { Rpc } from "backend";

export const connectionId = crypto.randomUUID();

export const bkClient = hc<Rpc>("http://localhost:8787/", {
  headers: {
    "x-public-id": connectionId,
  },
});

export type BkClient = typeof bkClient;
