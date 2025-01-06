import { number, z } from "zod";
import { err, ok } from "neverthrow";

export const PokeMessage = z.object({
  type: z.literal("poke"),
  version: z.number(),
});

export const ServerSentMessages = z.discriminatedUnion("type", [PokeMessage]);

export type ServerSentMessages = z.infer<typeof ServerSentMessages>;

export function parseServerSentMessages(data: unknown) {
  const result = ServerSentMessages.safeParse(data);

  if (!result.success) {
    return err({
      message: result.error.flatten(),
    });
  }

  return ok({ data: result.data });
}
