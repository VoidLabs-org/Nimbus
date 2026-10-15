import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useSession } from "../auth/useSession";

// Fetched once per signed-in User and shared by every component that asks, so moving between pages neither
// refetches nor hides the menu item while waiting. A reload fetches again.
const known = new Map<string, string[]>();
const pending = new Map<string, Promise<string[]>>();

function load(userId: string): Promise<string[]> {
  let request = pending.get(userId);
  if (!request) {
    request = api.myPlatformPermissions().then((held) => {
      known.set(userId, held);
      return held;
    });
    // A failed request is forgotten, so the next page tries again.
    request.catch(() => pending.delete(userId));
    pending.set(userId, request);
  }
  return request;
}

/**
 * The signed-in User's platform permissions, for hiding what they can't use. Empty until the server answers, and
 * when it can't be asked: the server checks every action anyway.
 */
export function usePlatformPermissions(): string[] {
  const { user } = useSession();
  const userId = user?.id;
  const [fetched, setFetched] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    load(userId)
      .then((held) => {
        if (current) setFetched(held);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [userId]);

  if (!userId) return [];
  return known.get(userId) ?? fetched;
}
