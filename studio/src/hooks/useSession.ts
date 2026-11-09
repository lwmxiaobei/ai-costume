import { authClient } from "../lib/auth-client";

export function useSession() {
  const session = authClient.useSession();
  return {
    user: session.data?.user || null,
    isPending: session.isPending,
    error: session.error,
    reload: session.refetch,
  };
}
