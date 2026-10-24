import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import {
  api,
  ApiError,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type TwoStepAnswer,
  type User,
} from "../api/client";
import { failedLoad } from "../api/failure";
import { SignInCheck } from "../shell/SignInCheck";
import { OfflinePage, ServerErrorPage } from "../shell/StatusPages";
import { loginPath } from "./returnPath";
import { VerifyEmailScreen } from "./VerifyEmailScreen";
import { SessionContext, useSession } from "./useSession";

// Holds the signed-in User in memory. On load it renews the session from the refresh cookie, so reloads
// and browser restarts keep the User signed in.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [unavailable, setUnavailable] = useState<"offline" | "server" | null>(null);
  const [signedOutOnPurpose, setSignedOutOnPurpose] = useState(false);
  const [returnAfterSignOut, setReturnAfterSignOut] = useState<string | null>(null);
  // Right after a correct code the screen stays up to say so, before the app opens.
  const [confirmingFor, setConfirmingFor] = useState<string | null>(null);
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

  // The server refuses an Unverified User on every endpoint but a few. However that surfaces (a page load, a save),
  // the verification screen takes over.
  useEffect(
    () =>
      api.onEmailUnverified(() =>
        setUser((current) =>
          current?.emailVerified ? { ...current, emailVerified: false } : current,
        ),
      ),
    [],
  );

  async function register(input: RegisterInput) {
    signedInAs(await api.register(input));
  }

  function signedInAs(signedIn: User) {
    queryClient.clear();
    setConfirmingFor(null);
    setUser(signedIn);
    setSignedOutOnPurpose(false);
  }

  async function login(input: LoginInput) {
    const signedIn = await api.login(input);
    if (!signedIn) return "two-step" as const;
    signedInAs(signedIn);
    return "signed-in" as const;
  }

  async function signInWithCode(answer: TwoStepAnswer) {
    signedInAs(await api.signInWithCode(answer));
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

  async function verifyEmail(code: string) {
    const signedIn = user?.id;
    const verified = await api.verifyEmail(code);
    // Pages that failed while the User was unverified must load again, not show their cached failure.
    queryClient.clear();
    // A sign-out, or another User signing in, meanwhile must not be overwritten by the slower check.
    setUser((current) => (current?.id === signedIn ? verified : current));
    // Tied to the User who verified, so a slow check that finishes after a sign-out or a different sign-in can't
    // make the next User see "Email verified".
    if (signedIn) setConfirmingFor(signedIn);
  }

  const finishVerifying = useCallback(() => setConfirmingFor(null), []);
  const confirmingEmail = confirmingFor !== null && confirmingFor === user?.id;

  async function logout(returnTo?: string) {
    await api.logout();
    queryClient.clear();
    setSignedOutOnPurpose(true);
    setReturnAfterSignOut(returnTo ?? null);
    setConfirmingFor(null);
    setUser(null);
  }

  return (
    <SessionContext
      value={{
        user,
        restoring,
        unavailable,
        signedOutOnPurpose,
        returnAfterSignOut,
        retry,
        register,
        login,
        signInWithCode,
        updateDisplayName,
        changePassword,
        verifyEmail,
        confirmingEmail,
        finishVerifying,
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
  const {
    user,
    restoring,
    unavailable,
    signedOutOnPurpose,
    returnAfterSignOut,
    confirmingEmail,
    retry,
  } = useSession();
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
  if (user && (!user.emailVerified || confirmingEmail)) return <VerifyEmailScreen />;
  if (user) return children;
  // A plain sign-out goes to a plain sign-in page; "Sign in again" asked to come back to a page, so it does.
  const to = signedOutOnPurpose
    ? returnAfterSignOut
      ? loginPath(returnAfterSignOut)
      : "/login"
    : loginPath(location.pathname + location.search);
  return <Navigate to={to} replace />;
}
