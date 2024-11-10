import { hc } from "hono/client";
import type { Rpc } from "backend";

export const bkClient = hc<Rpc>("http://localhost:8787/");

export type BkClient = typeof bkClient;
