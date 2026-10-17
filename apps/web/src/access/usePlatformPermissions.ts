import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { queryKeys } from "../api/queries";
import { useSession } from "../auth/useSession";

/**
 * The signed-in User's platform permissions, for hiding what they can't use. Kept for a minute and shared by every
 * component that asks, so moving between pages neither refetches nor hides the menu item while waiting. Empty until
 * the server answers, and when it can't be asked: the server checks every action anyway.
 */
export function usePlatformPermissions(): string[] {
  const { user } = useSession();
  const userId = user?.id ?? "";
  const query = useQuery({
    queryKey: queryKeys.myPermissions(userId),
    queryFn: () => api.myPlatformPermissions(),
    enabled: userId !== "",
    staleTime: 60_000,
  });
  return userId ? (query.data ?? []) : [];
}
