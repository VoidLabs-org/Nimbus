import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import {
  api,
  ApiError,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type User,
} from "../api/client";
import { failedLoad } from "../api/failure";
import { SignInCheck } from "../shell/SignInCheck";
import { OfflinePage, ServerErrorPage } from "../shell/StatusPages";
import { loginPath } from "./returnPath";
import { SessionContext, useSession } from "./useSession";

// Holds the signed-in User in memory. On load it renews the session from the refresh cookie, so reloads
// and browser restarts keep the User signed in.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [unavailable, setUnavailable] = useState<"offline" | "server" | null>(null);
  const [signedOutOnPurpose, setSignedOutOnPurpose] = useState(false);
  const queryClient = useQueryClient();

  // Cached server data belongs to the User who loaded it, so it goes just before they sign out or someone else signs
  // in: before the new User's pages render, so they never start from it and never fetch twice.

  // Only a 401 means there is no session. A rate limit or an outage says nothing about it, so the User
  // keeps their place and can retry instead of being sent to sign in again.
  function restore() {
    api
      .refresh()
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else setUnavailable(failedLoad(error) === "offline" ? "offline" : "server");
      })
      .finally(() => setRestoring(false));
  }

  function retry() {
    setRestoring(true);
    setUnavailable(null);
    restore();
  }

  useEffect(restore, []);

  async function register(input: RegisterInput) {
    const registered = await api.register(input);
    queryClient.clear();
    setUser(registered);
    setSignedOutOnPurpose(false);
  }

  async function login(input: LoginInput) {
    const signedIn = await api.login(input);
    queryClient.clear();
    setUser(signedIn);
    setSignedOutOnPurpose(false);
  }

  async function updateDisplayName(displayName: string) {
    const updated = await api.updateProfile({ displayName });
    // A sign-out, or another User signing in, meanwhile must not be overwritten by the slower rename.
    setUser((current) => (current?.id === updated.id ? updated : current));
  }

  async function changePassword(input: ChangePasswordInput) {
    const signedIn = user?.id;
    await api.changePassword(input);
    // A sign-out, or another User signing in, meanwhile must not be marked by the slower request.
    setUser((current) =>
      current && current.id === signedIn ? { ...current, hasPassword: true } : current,
    );
  }

  async function logout() {
    await api.logout();
    queryClient.clear();
    setSignedOutOnPurpose(true);
    setUser(null);
  }

  return (
    <SessionContext
      value={{
        user,
        restoring,
        unavailable,
        signedOutOnPurpose,
        retry,
        register,
        login,
        updateDisplayName,
        changePassword,
        logout,
      }}
    >
      {children}
    </SessionContext>
  );
}

/**
 * Shows its children only to a signed-in User; everyone else goes to the sign-in page, which brings
 * them back here afterwards.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, restoring, unavailable, signedOutOnPurpose, retry } = useSession();
  const location = useLocation();

  if (restoring) {
    return <SignInCheck message="Checking your session" />;
  }
  // The sign-in couldn't be checked: offline, or the server failed. Either way the User may try again.
  if (unavailable) {
    return unavailable === "offline" ? (
      <OfflinePage onRetry={retry} standalone />
    ) : (
      <ServerErrorPage onRetry={retry} standalone />
    );
  }
  if (user) return children;
  const to = signedOutOnPurpose ? "/login" : loginPath(location.pathname + location.search);
  return <Navigate to={to} replace />;
}
