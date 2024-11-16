import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initalizeEventRoomPartySocket } from "@/lib/features/broadcast/eventRoom";
import {
  LocalVideo,
  PromptUserForMediaPermission,
} from "@/lib/features/broadcast/localMedia";
import { broadcastState } from "@/lib/features/broadcast/state";
import { globalState } from "@/lib/globalState";
import { useSelector } from "@xstate/store/react";
import React, { useEffect } from "react";

function Layout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unsubscribe = initalizeEventRoomPartySocket();
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="grid place-items-center min-h-screen">
      {children}
    </div>
  );
}
export default function Index() {
  const mediaPermission = useSelector(
    broadcastState,
    (s) => s.context,
  );
  const eventParticipantStatus = useSelector(
    globalState,
    (s) => s.context.event.participantStatus,
  );

  if (mediaPermission.state === "determining") {
    return (
      <Layout>
        {null}
      </Layout>
    );
  }

  if (mediaPermission.state === "prompt") {
    return (
      <Layout>
        <Card>
          <CardHeader>
            <CardTitle>
              Provide permission to access your camera and microphone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PromptUserForMediaPermission />
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (mediaPermission.state === "denied") {
    return (
      <Layout>
        <Card className="max-w-72">
          <CardHeader>
            <CardTitle>
              Permission Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            You have perviously denied permission for camera or microphone.
            Provide permission to continue
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (mediaPermission.state === "granted") {
    return <Layout>Connecting to the event...</Layout>;
  }

  return (
    <Layout>
      <h1 className="font-semibold text-3xl">
        Participant Status: {eventParticipantStatus}
      </h1>
      <div className="flex gap-x-6">
        <LocalVideo
          className="size-80 bg-gray-300 rounded-md"
          mediaStream={mediaPermission.localMediaStream}
        />
        <video className="size-80 bg-gray-300 rounded-md" />
      </div>
    </Layout>
  );
}
