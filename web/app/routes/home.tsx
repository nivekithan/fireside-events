import { getPublicId } from "~/lib/features/identity";
import type { Route } from "./+types/home";
import { useMachine } from "@xstate/react";
import { broadcastMachine } from "~/lib/features/broadcast/state";
import React, { useEffect, useRef } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import invariant from "tiny-invariant";
import { Button } from "~/components/ui/button";

export function clientLoader({}: Route.ClientLoaderArgs) {
  const publicId = getPublicId();

  return { publicId };
}

export default function Component({}: Route.ComponentProps) {
  const [state, send] = useMachine(broadcastMachine);

  if (state.matches("determiningPermission")) {
    return <Layout roomVersion={state.context.roomVersion}>{null}</Layout>;
  } else if (state.matches("permissionDenied")) {
    return (
      <Layout roomVersion={state.context.roomVersion}>
        <Notify
          title="Permission Denied"
          description="Enable Permission by going to site settings"
        />
      </Layout>
    );
  } else if (state.matches("permissionGranted")) {
    return (
      <Layout roomVersion={state.context.roomVersion}>
        <Spinner />
      </Layout>
    );
  } else if (state.matches("permissionPending")) {
    return (
      <Layout roomVersion={state.context.roomVersion}>
        <Notify
          title="Permission Pending"
          description="Accept permission to share your webcam to continue using the site"
        />
      </Layout>
    );
  } else if (state.matches("unableToDeterminePermission")) {
    return (
      <Layout roomVersion={state.context.roomVersion}>
        <Notify
          title="Permission unable to determine"
          description="Try reloading the page or give permission manually by going to site settings"
        />
      </Layout>
    );
  } else if (state.matches("unableToGetMediaStream")) {
    return (
      <Layout roomVersion={state.context.roomVersion}>
        <Notify
          title="Error!"
          description="We are unable to load your webcam"
        />
      </Layout>
    );
  } else if (state.matches("broadcasting")) {
    return (
      <Layout roomVersion={state.context.roomVersion}>
        <Broadcasting state={state} send={send} />
      </Layout>
    );
  }
}

function Broadcasting({
  state,
  send,
}: React.PropsWithoutRef<{
  state: ReturnType<typeof broadcastMachine.getInitialSnapshot>;
  send: (event: any) => void;
}>) {
  const mediaStream = state.context.localMediaStream;
  const remoteMediaStreams = state.context.remoteMediaStreams;
  const rtcConnection = state.context.rtcPeerConnection;
  const signaling = state.context.signaling;

  // Check if video is enabled based on state machine
  const isVideoEnabled = state.matches({
    broadcasting: { localTracks: "broadcastVideo" },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const transceivers = rtcConnection?.getTransceivers();
      console.log("Running internval");
      console.log({
        rtcConnection,
        remoteMediaStreams,
        mediaStream,
        transceivers,
        state,
        signalingVersion: signaling?.version,
        signalingSyncedTracks: signaling?.syncedTracks,
      });
    }, 5_000);

    return () => {
      clearInterval(interval);
    };
  }, [mediaStream, remoteMediaStreams, rtcConnection, state, signaling]);

  invariant(mediaStream, `Expected context.localMediaStream to be not null`);

  function toggleVideoSharing() {
    if (isVideoEnabled) {
      send({ type: "pauseVideo" });
    } else {
      send({ type: "broadcastVideo" });
    }
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 flex-grow">
        <div className="relative">
          <MediaStream mediaStream={mediaStream} />
          <div className="absolute bottom-2 left-2 text-sm bg-black/50 text-white px-2 py-1 rounded flex items-center gap-2">
            <span>You (Local)</span>
            {!isVideoEnabled && (
              <span className="bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                Muted
              </span>
            )}
          </div>
        </div>
        {remoteMediaStreams.map(({ mediaStream, enabled, sessionId, name }, index) => {
          if (!mediaStream.active) {
            return null;
          }

          return (
            <div className="relative" key={mediaStream.id}>
              <MediaStream mediaStream={mediaStream} />
              <div className="absolute bottom-2 left-2 text-sm bg-black/50 text-white px-2 py-1 rounded flex items-center gap-2">
                <span>Participant {index + 1}</span>
                {!enabled && (
                  <span className="bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                    Muted
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bottom-0 left-0 right-0 p-5 absolute bg-black/20 backdrop-blur-sm flex justify-center gap-4">
        <Button
          type="button"
          onClick={toggleVideoSharing}
          className={`rounded-full w-12 h-12 flex items-center justify-center ${
            !isVideoEnabled ? "bg-red-500 hover:bg-red-600" : ""
          }`}
        >
          {isVideoEnabled ? "🎥" : "🚫"}
        </Button>
      </div>
    </div>
  );
}

function MediaStream({ mediaStream }: { mediaStream: MediaStream }) {
  const videoEleRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoEleRef.current) {
      return;
    }

    videoEleRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  return (
    <video
      ref={videoEleRef}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-cover bg-gray-900 rounded-lg shadow-md"
    />
  );
}
function Notify({
  description,
  title,
}: React.PropsWithoutRef<{ title: string; description: string }>) {
  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function Layout({
  children,
  roomVersion,
}: React.PropsWithChildren<{ roomVersion: number }>) {
  return (
    <div className="grid place-items-center min-h-screen relative bg-gradient-to-b from-gray-900 to-gray-950">
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-black/30 backdrop-blur-sm z-10">
        <TopLeftText text={getPublicId()} />
        <TopRightText text={`Room v${roomVersion}`} />
      </div>
      <div className="w-full h-full py-16">{children}</div>
    </div>
  );
}

function TopLeftText({ text }: React.PropsWithoutRef<{ text: string }>) {
  return (
    <div className="text-white font-medium px-3 py-1 bg-black/40 rounded-full">
      ID: {text}
    </div>
  );
}

function TopRightText({ text }: React.PropsWithoutRef<{ text: string }>) {
  return (
    <div className="text-white font-medium px-3 py-1 bg-black/40 rounded-full">
      {text}
    </div>
  );
}
