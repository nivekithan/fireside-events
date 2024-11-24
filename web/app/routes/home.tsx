import { getPublicId } from "~/lib/features/identity";
import type { Route } from "./+types/home";

export function clientLoader({ }: Route.ClientLoaderArgs) {
  const publicId = getPublicId();

  return { publicId };
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { publicId } = loaderData;

  return <h1>{publicId}</h1>;
}
