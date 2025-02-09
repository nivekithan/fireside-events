import { HoneycombWebSDK } from "@honeycombio/opentelemetry-web";
import { context, Context, Span, trace } from "@opentelemetry/api";
import { getPublicId } from "../features/identity";

const SERVICE_NAME = "fireside-events";

export const Attributes = {
  PUBLIC_ID: "PUBLIC_ID",
};

export const sdk = new HoneycombWebSDK({
  debug: true,
  serviceName: SERVICE_NAME,
  apiKey: import.meta.env.VITE_HONEYCOMB_INGEST_API_KEY,
  webVitalsInstrumentationConfig: { enabled: false },
  resourceAttributes: {
    [Attributes.PUBLIC_ID]: getPublicId(),
  },
});

export const callsTracer = trace.getTracer("calls-state");

export const EMPTY = "__EMPTY__";

export type WithContext<T> = T & { ctx: Context };

export function makeParentSpanCtx(span: Span) {
  return trace.setSpan(context.active(), span);
}

export const StatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;
