import { getPublicId } from "~/lib/features/identity";
import type { Route } from "./+types/home";
import { useMachine } from "@xstate/react";
import { broadcastMachine } from "~/lib/features/broadcast/state";
import React from "react";

export function clientLoader({}: Route.ClientLoaderArgs) {
  const publicId = getPublicId();

  return { publicId };
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { publicId } = loaderData;
  const [snapshot] = useMachine(broadcastMachine);

  if (snapshot.matches("determiningPermission")) {
    return <Layout>{"Determining Position"}</Layout>;
  } else if (snapshot.matches("permissionDenied")) {
    return <Layout>{"Permissing Denined"}</Layout>;
  } else if (snapshot.matches("permissionGranted")) {
    return <Layout>{"Permission Granted"}</Layout>;
  } else if (snapshot.matches("permissionPending")) {
    return <Layout>Permission Pending</Layout>;
  } else if (snapshot.matches("unableToDeterminePermission")) {
    return <Layout>Unable to determine position</Layout>;
  } else if (snapshot.matches("unableToGetMediaStream")) {
    return <Layout>Unable to get media stream</Layout>;
  } else if (snapshot.matches("broadcasting")) {
    return <Layout>Broadcasting</Layout>;
  }
}

function Layout({ children }: React.PropsWithChildren<{}>) {
  return <div className="grid place-items-center min-h-screen">{children}</div>;
}
