import { Center, Loader } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { api, type LoginInput, type RegisterInput, type User } from "../api/client";
import { loginPath } from "./returnPath";
import { SessionContext, useSession } from "./useSession";

// Holds the signed-in User in memory. On load it renews the session from the refresh cookie, so reloads
// and browser restarts keep the User signed in.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    api
      .refresh()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setRestoring(false));
  }, []);

  async function register(input: RegisterInput) {
    setUser(await api.register(input));
  }

  async function login(input: LoginInput) {
    setUser(await api.login(input));
  }

  return <SessionContext value={{ user, restoring, register, login }}>{children}</SessionContext>;
}

/**
 * Shows its children only to a signed-in User; everyone else goes to the sign-in page, which brings
 * them back here afterwards.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, restoring } = useSession();
  const location = useLocation();

  if (restoring) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  return user ? children : <Navigate to={loginPath(location.pathname + location.search)} replace />;
}
