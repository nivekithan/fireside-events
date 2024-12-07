import { z } from "zod";

export const LocalTracksSchema = z.object({
  mId: z.string(),
  name: z.string(),
});

export const PushTrackMessage = z.object({
  sdp: z.string(),
  tracks: z.array(LocalTracksSchema),
  type: z.literal("pushTrack"),
});

export const RtcAnswer = z.object({
  type: z.literal("rtcAnswer"),
  sdp: z.string(),
});

export const ClientSentMessages = z.discriminatedUnion("type", [
  PushTrackMessage,
  RtcAnswer,
]);

export type ClientSentMessage = z.infer<typeof ClientSentMessages>;

export const RtcOffer = z.object({
  type: z.literal("rtcOffer"),
  sdp: z.string(),
});

export const ServerSentMessages = z.discriminatedUnion("type", [
  RtcAnswer,
  RtcOffer,
]);

export type ServerSentMessages = z.infer<typeof ServerSentMessages>;
