import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useSession } from "../auth/useSession";

/**
 * The signed-in User's platform permissions, for hiding what they can't use. Empty until the server answers, and
 * when it can't be asked: the server checks every action anyway.
 */
export function usePlatformPermissions(): string[] {
  const { user } = useSession();
  const userId = user?.id;
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    api
      .myPlatformPermissions()
      .then((held) => {
        if (current) setPermissions(held);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [userId]);

  return userId ? permissions : [];
}
