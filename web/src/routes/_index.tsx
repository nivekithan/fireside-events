import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initalizeEventRoomPartySocket } from "@/lib/features/broadcast/eventRoom";
import {
  LocalVideo,
  PromptUserForMediaPermission,
  useMediaPermissionState,
} from "@/lib/features/localMedia";
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
  const { data: mediaPermissionState, isPending } = useMediaPermissionState();
  const eventParticipantStatus = useSelector(
    globalState,
    (s) => s.context.eventParticipantStatus,
  );

  if (isPending) {
    return (
      <Layout>
        {null}
      </Layout>
    );
  }

  if (mediaPermissionState === "prompt") {
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

  if (mediaPermissionState === "denied") {
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

  return (
    <Layout>
      <h1 className="font-semibold text-3xl">
        Participant Status: {eventParticipantStatus}
      </h1>
      <div className="flex gap-x-6">
        <LocalVideo className="size-80 bg-gray-300 rounded-md" />
        <video className="size-80 bg-gray-300 rounded-md" />
      </div>
    </Layout>
  );
}
