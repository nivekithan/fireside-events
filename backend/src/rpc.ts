import { app } from "./server";

export type Rpc = typeof app;

export type { EventRoomMessages } from "./features/eventRoom";
