import { hc } from "hono/client";
import { Rpc } from "backend";

export const bk = hc<Rpc>(import.meta.env.VITE_BACKEND_BASE_URL);
