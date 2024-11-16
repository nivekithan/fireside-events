/* eslint-disable react-refresh/only-export-components */
import { Button } from "@/components/ui/button";
import { ComponentProps, useEffect, useRef } from "react";
import { broadcastState } from "./state";
import { broadcastMediaStream } from "./broadcastVideo";
import { bkClient } from "@/lib/backend";

export async function initalizeBroadcastState() {
  console.log("[DEBUG] Calling initalizeBroadcastState");

  const mediaState = await getMediaPermissionState();
  const currentState = broadcastState.getSnapshot();

  if (currentState.context.state === mediaState) {
    return;
  }

  if (mediaState === "prompt") {
    broadcastState.send({ type: "promptConsent" });
  } else if (mediaState === "denied") {
    broadcastState.send({ type: "consentDenied" });
  } else if (mediaState === "granted") {
    broadcastState.send({ type: "consentGranted" });

    const mediaStream = await initialiseMediaStream();
    const rtcPeerConnection = await broadcastMediaStream(mediaStream, {
      bkClient: bkClient,
    });
    broadcastState.send({
      type: "broadcastStarted",
      rtcPeerConnection,
      localMediaStream: mediaStream,
    });
  } else if (mediaState === "unable_to_determine") {
    throw new Error(
      `TODO: Handling unable_to_determin permission state for userMedai`,
    );
  } else {
    throw new Error(`Unknown mediaState ${mediaState}`);
  }
}

async function getMediaPermissionState() {
  try {
    const microphonePermissionState = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    const webcamPermissonState = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });

    microphonePermissionState.addEventListener(
      "change",
      initalizeBroadcastState,
    );
    webcamPermissonState.addEventListener("change", initalizeBroadcastState);

    const combinedPermission = [
      microphonePermissionState.state,
      webcamPermissonState.state,
    ];

    if (combinedPermission.includes("denied")) {
      return "denied";
    } else if (combinedPermission.includes("prompt")) {
      return "prompt";
    } else if (combinedPermission.includes("granted")) {
      return "granted";
    }
  } catch (err) {
    console.error(err);
    return "unable_to_determine";
  }

  throw new Error("not possible");
}

async function initialiseMediaStream() {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });

  return mediaStream;
}

async function promptUserForMediaPermission() {
  const mediaStream = await initialiseMediaStream();

  mediaStream.getTracks().forEach((track) => {
    track.stop();
  });
}

export function PromptUserForMediaPermission() {
  return (
    <Button
      type="button"
      onClick={promptUserForMediaPermission}
    >
      Provide permission
    </Button>
  );
}

export function LocalVideo(
  { mediaStream, ...props }: ComponentProps<"video"> & {
    mediaStream: MediaStream;
  },
) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!localVideoRef.current) return;

    console.log("Setting localStream to localVideo srcObject");
    localVideoRef.current.srcObject = mediaStream;
    localVideoRef.current.muted = true;
  }, [mediaStream]);

  return <video playsInline autoPlay {...props} ref={localVideoRef} />;
}
