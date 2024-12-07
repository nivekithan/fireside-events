import { Hono } from "hono";
import { cors } from "hono/cors";

export const app = new Hono<{ Bindings: Env }>().use("*", cors());
