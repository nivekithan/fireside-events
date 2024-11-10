import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LocalVideo,
  PromptUserForMediaPermission,
  useMediaPermissionState,
} from "@/lib/features/localMedia";
import React from "react";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center min-h-screen">
      {children}
    </div>
  );
}
export default function Index() {
  const { data: mediaPermissionState, isPending } = useMediaPermissionState();

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
    <div className="grid place-items-center min-h-screen">
      <div className="flex gap-x-6">
        <LocalVideo className="size-80 bg-gray-300 rounded-md" />
        <video className="size-80 bg-gray-300 rounded-md" />
      </div>
    </div>
  );
}
