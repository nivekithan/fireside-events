import { err, ok, Result } from "neverthrow";

export function safeJsonParse(json: string): Result<unknown, SyntaxError> {
  try {
    const res: unknown = JSON.parse(json);
    return ok(res);
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      return err(e);
    }

    throw new Error(`[UNREACHABLE] safeJson: unexpected error: ${e}`);
  }
}
