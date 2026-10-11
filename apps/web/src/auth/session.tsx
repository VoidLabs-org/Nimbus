import { useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { api, type LoginInput, type RegisterInput, type User } from "../api/client";
import { SessionContext, useSession } from "./useSession";

// Holds the signed-in User in memory. Reloading the page signs out until refresh tokens land (ticket #4).
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  async function register(input: RegisterInput) {
    setUser(await api.register(input));
  }

  async function login(input: LoginInput) {
    setUser(await api.login(input));
  }

  return <SessionContext value={{ user, register, login }}>{children}</SessionContext>;
}

/** Shows its children only to a signed-in User; everyone else goes to the sign-in page. */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return user ? children : <Navigate to="/login" replace />;
}
