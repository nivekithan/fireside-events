import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import { ComponentProps, useEffect, useRef, useState } from "react";

async function getMediaPermissionState() {
  try {
    const microphonePermissionState = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    const webcamPermissonState = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });

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

// TODO: Use sync external store with PermissionStatus onChange event to sync
// react with it's status https://developer.mozilla.org/en-US/docs/Web/API/PermissionStatus
export function useMediaPermissionState() {
  const state = useQuery({
    queryKey: ["userMedia", "permissionState"],
    queryFn: getMediaPermissionState,
  });

  return state;
}

let localMediaStream: null | MediaStream = null;

async function initialiseMediaStream() {
  try {
    if (localMediaStream) {
      return localMediaStream;
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    localMediaStream = mediaStream;

    return localMediaStream;
  } finally {
    queryClient.invalidateQueries({
      queryKey: ["userMedia", "permissionState"],
    });
  }
}

export function getLocalMediaStream() {
  return localMediaStream;
}

export function PromptUserForMediaPermission() {
  return (
    <Button
      type="button"
      onClick={initialiseMediaStream}
    >
      Provide permission
    </Button>
  );
}

function useLocalMediaStream() {
  const [stream, setStream] = useState(localMediaStream);

  useEffect(() => {
    if (stream) return;

    (async () => {
      const newLocalStream = await initialiseMediaStream();

      setStream(newLocalStream);
    })();
  }, [stream]);

  return stream;
}

export function LocalVideo(props: ComponentProps<"video">) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStream = useLocalMediaStream();

  useEffect(() => {
    if (!localStream || !localVideoRef.current) return;

    console.log("Setting localStream to localVideo srcObject");
    localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  return <video playsInline autoPlay {...props} ref={localVideoRef} />;
}
