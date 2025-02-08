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
  const [snapshot] = useMachine(broadcastMachine);

  if (snapshot.matches("determiningPermission")) {
    return <Layout roomVersion={snapshot.context.roomVersion}>{null}</Layout>;
  } else if (snapshot.matches("permissionDenied")) {
    return (
      <Layout roomVersion={snapshot.context.roomVersion}>
        <Notify
          title="Permission Denied"
          description="Enable Permission by going to site settings"
        />
      </Layout>
    );
  } else if (snapshot.matches("permissionGranted")) {
    return (
      <Layout roomVersion={snapshot.context.roomVersion}>
        <Spinner />
      </Layout>
    );
  } else if (snapshot.matches("permissionPending")) {
    return (
      <Layout roomVersion={snapshot.context.roomVersion}>
        <Notify
          title="Permission Pending"
          description="Accept permission to share your webcam to continue using the site"
        />
      </Layout>
    );
  } else if (snapshot.matches("unableToDeterminePermission")) {
    return (
      <Layout roomVersion={snapshot.context.roomVersion}>
        <Notify
          title="Permission unable to determine"
          description="Try reloading the page or give permission manually by going to site settings"
        />
      </Layout>
    );
  } else if (snapshot.matches("unableToGetMediaStream")) {
    return (
      <Layout roomVersion={snapshot.context.roomVersion}>
        <Notify
          title="Error!"
          description="We are unable to load your webcam"
        />
      </Layout>
    );
  } else if (snapshot.matches("broadcasting")) {
    return (
      <Layout roomVersion={snapshot.context.roomVersion}>
        <Broadcasting snapshot={snapshot} />
      </Layout>
    );
  }
}

function Broadcasting({
  snapshot,
}: React.PropsWithoutRef<{
  snapshot: ReturnType<typeof broadcastMachine.getInitialSnapshot>;
}>) {
  const mediaStream = snapshot.context.localMediaStream;
  const remoteMediaStreams = snapshot.context.remoteMediaStreams;
  const rtcConnection = snapshot.context.rtcPeerConnection;
  const signaling = snapshot.context.signaling;

  useEffect(() => {
    console.log({
      rtcConnection,
      remoteMediaStreams,
      mediaStream,
      snapshot,
    });
    const interval = setInterval(() => {
      const transceivers = rtcConnection?.getTransceivers();
      console.log({
        rtcConnection,
        remoteMediaStreams,
        mediaStream,
        transceivers,
        snapshot,
        signalingVersion: signaling?.version,
        signalingSyncedTracks: signaling?.syncedTracks,
      });
    }, 5_000);

    return () => {
      clearInterval(interval);
    };
  }, [mediaStream, remoteMediaStreams, rtcConnection, snapshot, signaling]);

  invariant(mediaStream, `Expected context.localMediaStream to be not null`);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        <MediaStream mediaStream={mediaStream} />
        {remoteMediaStreams.map(({ mediaStream }) => {
          if (!mediaStream.active) {
            return null;
          }

          return <MediaStream mediaStream={mediaStream} key={mediaStream.id} />;
        })}
      </div>
      <div className="bottom-0 left-0 right-0 p-3 absolute">
        <Button type="button">Toggle Video</Button>
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
  }, []);

  return (
    <video
      ref={videoEleRef}
      autoPlay
      playsInline
      className="size-72 rounded-lg"
    />
  );
}
function Notify({
  description,
  title,
}: React.PropsWithoutRef<{ title: string; description: string }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function Layout({
  children,
  roomVersion,
}: React.PropsWithChildren<{ roomVersion: number }>) {
  return (
    <div className="grid place-items-center min-h-screen relative">
      <TopLeftText text={getPublicId()} />
      <TopRightText text={`${roomVersion}`} />
      {children}
    </div>
  );
}

function TopLeftText({ text }: React.PropsWithoutRef<{ text: string }>) {
  return (
    <div className="absolute top-4 left-4 text-white font-medium">{text}</div>
  );
}
function TopRightText({ text }: React.PropsWithoutRef<{ text: string }>) {
  return (
    <div className="absolute top-4 right-4 text-white font-medium">{text}</div>
  );
}
