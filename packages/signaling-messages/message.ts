import { number, z } from "zod";
import { err, ok } from "neverthrow";

export const PokeMessage = z.object({
  type: z.literal("poke"),
  version: z.number(),
});

export const PauseRemoteVideoMessage = z.object({
  type: z.literal("pause_remote_video"),
  name: z.string(),
});

export const ResumeRemoteVideoMessage = z.object({
  type: z.literal("resume_remote_video"),
  name: z.string(),
});

export const ServerSentMessages = z.discriminatedUnion("type", [
  PokeMessage,
  PauseRemoteVideoMessage,
  ResumeRemoteVideoMessage,
]);

export type ServerSentMessages = z.infer<typeof ServerSentMessages>;

export const PauseVideoMessage = z.object({
  type: z.literal("pause_viedo"),
});

export const ResumeVideoMessage = z.object({
  type: z.literal("resume_video"),
});

export const ClientSentMessage = z.discriminatedUnion("type", [
  PauseVideoMessage,
  ResumeVideoMessage,
]);

export type ClientSentMessage = z.infer<typeof ClientSentMessage>;

export function parseServerSentMessages(data: unknown) {
  const result = ServerSentMessages.safeParse(data);

  if (!result.success) {
    return err({
      message: result.error.flatten(),
    });
  }

  return ok({ data: result.data });
}
