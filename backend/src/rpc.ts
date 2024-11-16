import { app } from "./server";

export type Rpc = typeof app;

export type { EventRoomServerMessages } from "./features/eventRoom";
