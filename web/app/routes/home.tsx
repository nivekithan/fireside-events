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
  const mediaStream = snapshot.context.localMediaStream;
  const remoteMediaStreams = snapshot.context.remoteMediaStreams;
  const rtcConnection = snapshot.context.rtcPeerConnection;

  console.log("snapshot", snapshot);

  invariant(mediaStream, `Expected context.localMediaStream to be not null`);

  useEffect(() => {
    const intervalId = setInterval(() => {
      // console.log(rtcConnection?.getTransceivers().map((t) => t));
      if (rtcConnection) {
        formatStatsForLogging(rtcConnection).then((stats) => {
          console.log("peerconnectionStats", stats);
          console.log("iceconnectionState", rtcConnection.iceConnectionState);
        });
      }
    }, 5_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [rtcConnection]);

  return (
    <div>
      <MediaStream mediaStream={mediaStream} />
      {remoteMediaStreams.map((mediaStream) => {
        return <MediaStream mediaStream={mediaStream} key={mediaStream.id} />;
      })}
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

  // useEffect(() => {
  //   const intervalId = setInterval(() => {
  //     console.log(mediaStream.getTracks());
  //   }, 5_000);

  //   return () => {
  //     clearInterval(intervalId);
  //   };
  // }, []);

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
async function formatStatsForLogging(peerConnection: RTCPeerConnection) {
  try {
    const stats = await peerConnection.getStats(null);
    const formattedStats: any = {};

    stats.forEach((report) => {
      const statObject: any = {
        id: report.id,
        type: report.type,
        timestamp: report.timestamp,
      };

      // Add specific properties based on the type of the report
      switch (report.type) {
        case "inbound-rtp":
        case "outbound-rtp":
          statObject.mediaType = report.mediaType;
          statObject.ssrc = report.ssrc;
          statObject.packetsSent = report.packetsSent || 0;
          statObject.packetsReceived = report.packetsReceived || 0;
          statObject.bytesSent = report.bytesSent || 0;
          statObject.bytesReceived = report.bytesReceived || 0;
          break;
        case "candidate-pair":
          statObject.bytesSent = report.bytesSent || 0;
          statObject.bytesReceived = report.bytesReceived || 0;
          statObject.currentRoundTripTime = report.currentRoundTripTime || 0;
          statObject.totalRoundTripTime = report.totalRoundTripTime || 0;
          break;
        case "local-candidate":
        case "remote-candidate":
          statObject.candidateType = report.candidateType;
          statObject.ip = report.ip;
          statObject.networkType = report.networkType;
          break;
        // Add more cases as needed to handle other report types
        default:
          break;
      }

      formattedStats[report.id] = statObject;
    });

    return formattedStats;
  } catch (error) {
    console.error("Error fetching stats:", error);
    return null;
  }
}
