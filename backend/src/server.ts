import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CallsProxyRouter } from './features/callsProxy';

export const app = new Hono<{ Bindings: Env }>().use('*', cors()).route('/calls', CallsProxyRouter);
