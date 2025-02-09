import { HoneycombWebSDK } from "@honeycombio/opentelemetry-web";
import { context, Context, Span, trace } from "@opentelemetry/api";

const SERVICE_NAME = "fireside-events";

export const sdk = new HoneycombWebSDK({
  debug: true,
  serviceName: SERVICE_NAME,
  apiKey: import.meta.env.VITE_HONEYCOMB_INGEST_API_KEY,
  webVitalsInstrumentationConfig: { enabled: false },
});

export const callsTracer = trace.getTracer("calls-state");

export const EMPTY = "__EMPTY__";

export type WithContext<T> = T & { ctx: Context };

export function makeParentSpanCtx(span: Span) {
  return trace.setSpan(context.active(), span);
}
