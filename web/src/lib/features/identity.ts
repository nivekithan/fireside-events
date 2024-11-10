import useLocalStorage from "use-local-storage";

export function useIdentity() {
  const [userId] = useLocalStorage("userId", crypto.randomUUID());

  return { userId };
}
