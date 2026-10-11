import { Alert, Button, Center, Loader, Stack } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { api, ApiError, type LoginInput, type RegisterInput, type User } from "../api/client";
import { loginPath } from "./returnPath";
import { SessionContext, useSession } from "./useSession";

// Holds the signed-in User in memory. On load it renews the session from the refresh cookie, so reloads
// and browser restarts keep the User signed in.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // Only a 401 means there is no session. A rate limit or an outage says nothing about it, so the User
  // keeps their place and can retry instead of being sent to sign in again.
  function restore() {
    api
      .refresh()
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else setUnavailable(true);
      })
      .finally(() => setRestoring(false));
  }

  function retry() {
    setRestoring(true);
    setUnavailable(false);
    restore();
  }

  useEffect(restore, []);

  async function register(input: RegisterInput) {
    setUser(await api.register(input));
  }

  async function login(input: LoginInput) {
    setUser(await api.login(input));
  }

  return (
    <SessionContext value={{ user, restoring, unavailable, retry, register, login }}>
      {children}
    </SessionContext>
  );
}

/**
 * Shows its children only to a signed-in User; everyone else goes to the sign-in page, which brings
 * them back here afterwards.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, restoring, unavailable, retry } = useSession();
  const location = useLocation();

  if (restoring) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (unavailable) {
    return (
      <Center h="100vh" p="md">
        <Stack align="center">
          <Alert color="yellow">We couldn't check your sign-in right now. Please try again.</Alert>
          <Button onClick={retry}>Try again</Button>
        </Stack>
      </Center>
    );
  }
  return user ? children : <Navigate to={loginPath(location.pathname + location.search)} replace />;
}
