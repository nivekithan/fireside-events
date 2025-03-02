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
  const screenShareStream = state.context.localScreenShareStream;

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
      {screenShareStream ? (
        <div className="w-full p-4">
          <div className="relative w-full" style={{ height: "40vh" }}>
            <MediaStream mediaStream={screenShareStream} />
            <div className="absolute bottom-2 left-2 text-sm bg-black/50 text-white px-2 py-1 rounded">
              <span>Your Screen</span>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 flex-grow ${
          screenShareStream ? "max-h-[40vh]" : ""
        }`}
      >
        <div className="relative">
          <MediaStream mediaStream={mediaStream} isMuted={!isVideoEnabled} />
          <div className="absolute bottom-2 left-2 text-sm bg-black/50 text-white px-2 py-1 rounded flex items-center gap-2">
            <span>You (Local)</span>
            {!isVideoEnabled && (
              <span className="bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                Muted
              </span>
            )}
          </div>
        </div>
        {remoteMediaStreams.map(({ mediaStream, enabled }, index) => {
          if (!mediaStream.active) {
            return null;
          }

          return (
            <div className="relative" key={mediaStream.id}>
              <MediaStream mediaStream={mediaStream} isMuted={!enabled} />
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
        <Button
          type="button"
          onClick={() => send({ type: "startScreenShare" })}
          className={`rounded-full w-12 h-12 flex items-center justify-center ${
            screenShareStream ? "bg-blue-500 hover:bg-blue-600" : ""
          }`}
        >
          📺
        </Button>
      </div>
    </div>
  );
}

function AnimatedAvatar() {
  return (
    <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
      <div className="relative">
        {/* Circle background */}
        <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center">
          {/* User silhouette */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-12 h-12 text-gray-500"
          >
            <path
              fillRule="evenodd"
              d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        {/* Animated pulse rings */}
        <div
          className="absolute inset-0 rounded-full bg-gray-600/30 animate-ping-slow"
          style={{ animationDelay: "0s" }}
        ></div>
        <div
          className="absolute inset-0 rounded-full bg-gray-600/20 animate-ping-slow"
          style={{ animationDelay: "0.8s" }}
        ></div>
        <div
          className="absolute inset-0 rounded-full bg-gray-600/10 animate-ping-slow"
          style={{ animationDelay: "1.6s" }}
        ></div>
      </div>
      {/* Camera off icon */}
      <div className="absolute bottom-4 right-4 bg-gray-900/80 rounded-full p-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-6 h-6 text-red-500"
        >
          <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.5 17.69c0 .471-.202.86-.504 1.124l-4.746-4.746V7.939l2.69-2.689c.944-.945 2.56-.276 2.56 1.06v11.38zM15.75 7.5v5.068L7.682 4.5h5.068a3 3 0 013 3zM1.5 7.5c0-.828.672-1.5 1.5-1.5h7.682L4.879 12.803A3 3 0 013 9.75V7.5z" />
        </svg>
      </div>
    </div>
  );
}

function MediaStream({
  mediaStream,
  isMuted,
}: {
  mediaStream: MediaStream;
  isMuted?: boolean;
}) {
  const videoEleRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoEleRef.current) {
      return;
    }

    videoEleRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoEleRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover bg-gray-900 rounded-lg shadow-md"
      />
      {isMuted && (
        <div className="absolute inset-0">
          <AnimatedAvatar />
        </div>
      )}
    </div>
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
