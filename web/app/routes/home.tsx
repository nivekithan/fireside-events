import { getPublicId } from "~/lib/features/identity";
import type { Route } from "./+types/home";
import { useMachine } from "@xstate/react";
import {
  BroadcastMachine,
  broadcastMachine,
} from "~/lib/features/broadcast/state";
import React, { useEffect, useRef } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { NOTFOUND } from "dns";
import { MachineSnapshot } from "xstate";
import invariant from "tiny-invariant";

export function clientLoader({}: Route.ClientLoaderArgs) {
  const publicId = getPublicId();

  return { publicId };
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { publicId } = loaderData;
  const [snapshot] = useMachine(broadcastMachine);

  if (snapshot.matches("determiningPermission")) {
    return <Layout>{null}</Layout>;
  } else if (snapshot.matches("permissionDenied")) {
    return (
      <Layout>
        <Notify
          title="Permission Denied"
          description="Enable Permission by going to site settings"
        />
      </Layout>
    );
  } else if (snapshot.matches("permissionGranted")) {
    return (
      <Layout>
        <Spinner />
      </Layout>
    );
  } else if (snapshot.matches("permissionPending")) {
    return (
      <Layout>
        <Notify
          title="Permission Pending"
          description="Accept permission to share your webcam to continue using the site"
        />
      </Layout>
    );
  } else if (snapshot.matches("unableToDeterminePermission")) {
    return (
      <Layout>
        <Notify
          title="Permission unable to determine"
          description="Try reloading the page or give permission manually by going to site settings"
        />
      </Layout>
    );
  } else if (snapshot.matches("unableToGetMediaStream")) {
    return (
      <Layout>
        <Notify
          title="Error!"
          description="We are unable to load your webcam"
        />
      </Layout>
    );
  } else if (snapshot.matches("broadcasting")) {
    return (
      <Layout>
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
  const videoEleRef = useRef<HTMLVideoElement | null>(null);
  const mediaStream = snapshot.context.localMediaStream;

  invariant(mediaStream, `Expected context.localMediaStream to be not null`);

  useEffect(() => {
    if (!videoEleRef.current) {
      return;
    }

    console.log(`VideoRef`, mediaStream.getTracks().length);
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

function Layout({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="grid place-items-center min-h-screen relative">
      <TopLeftText text={getPublicId()} />
      {children}
    </div>
  );
}

function TopLeftText({ text }: React.PropsWithoutRef<{ text: string }>) {
  return (
    <div className="absolute top-4 left-4 text-white font-medium">{text}</div>
  );
}
