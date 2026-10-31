import { ApiError, NetworkError } from "@repo/api";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "expo-router";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";
import { apiUrl } from "../config";
import {
  createMobileApi,
  type MobileApi,
  type RegisterInput,
  type SecondCode,
  type SignInOutcome,
  type User,
} from "./client";
import { pendingSignInStore, refreshTokenStore, rememberedDevices, welcomeSeen } from "./storage";
import { nimbusUserAgent } from "./userAgent";

/**
 * Where the app stands with the User's Session:
 * - `starting`: reading the phone's storage and renewing a stored Session (the splash screen stays up)
 * - `signedOut`: no Session; Welcome on the first launch, Sign in after that
 * - `signedIn`: the tabs; `user` as the server sent it at `since` (a sign-in or a renewal). An Unverified User
 *   (`emailVerified` false) sees only the verify-email screen instead
 * - `expired`: the Session ended while the app had it; "Your session expired", then Sign in returns to `returnTo`
 * - `offline` / `serverError`: a stored Session couldn't be renewed for now; nothing is signed out
 */
export type SessionState =
  | { kind: "starting" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; user: User; since: number }
  | { kind: "expired"; returnTo: string | null }
  | { kind: "offline" }
  | { kind: "serverError" };

type Session = {
  state: SessionState;
  /** False only before this phone has left the first-launch Welcome screen. */
  welcomed: boolean;
  api: MobileApi;
  markWelcomed: () => void;
  signIn: (email: string, password: string) => Promise<SignInOutcome>;
  /** The second step of a Two-step sign-in. Rejects with the server's ApiError if the code is refused. */
  finishTwoStep: (secondCode: SecondCode, rememberDevice: boolean) => Promise<void>;
  /** Leaves the code step without finishing it. */
  cancelTwoStep: () => Promise<void>;
  /** Creates a User and signs them in, as an Unverified User. */
  register: (input: RegisterInput) => Promise<void>;
  /** Checks the Verification code; once it is right the app opens. Rejects with the server's ApiError if refused. */
  verifyEmail: (code: string) => Promise<void>;
  /** Reads the User again, as when their email was verified on another device. */
  reload: () => Promise<void>;
  /** Ends this phone's Session on the server; rejects, still signed in, when the server can't be reached. */
  signOut: () => Promise<void>;
  /** Forgets the Session on this phone only, for when the server is down and the User wants out anyway. */
  forget: () => Promise<void>;
  /** From "Your session expired": on to Sign in. */
  signInAgain: () => void;
  /** Tries renewing the stored Session again, from the offline and server-error screens. */
  retry: () => Promise<void>;
  /** Where a Sign in after an expired Session goes back to; taken once. */
  takeReturnTo: () => string | null;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider");
  return session;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ kind: "starting" });
  const [welcomed, setWelcomed] = useState(true);
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  const returnTo = useRef<string | null>(null);

  useEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);

  const [api] = useState(() =>
    createMobileApi({
      baseUrl: apiUrl,
      store: refreshTokenStore,
      pendingStore: pendingSignInStore,
      remembered: rememberedDevices,
      userAgent: nimbusUserAgent(),
      onSessionLost: () => {
        queryClient.clear();
        setState({ kind: "expired", returnTo: currentPath.current });
      },
    }),
  );

  /** Renews a stored Session, as on every launch. */
  async function restore() {
    try {
      const user = await api.restore();
      setState(user ? { kind: "signedIn", user, since: Date.now() } : { kind: "signedOut" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ kind: "expired", returnTo: null });
      } else {
        setState({ kind: error instanceof NetworkError ? "offline" : "serverError" });
      }
    }
  }

  useEffect(() => {
    void (async () => {
      setWelcomed(await welcomeSeen.get());
      await restore();
    })();
    // Once, on launch.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);

  function signedIn(user: User) {
    setWelcomed(true);
    void welcomeSeen.set();
    setState({ kind: "signedIn", user, since: Date.now() });
  }

  const session: Session = {
    state,
    welcomed,
    api,
    markWelcomed: () => {
      setWelcomed(true);
      void welcomeSeen.set();
    },
    signIn: async (email, password) => {
      const outcome = await api.signIn(email, password);
      if ("user" in outcome) signedIn(outcome.user);
      return outcome;
    },
    finishTwoStep: async (secondCode, rememberDevice) => {
      signedIn(await api.finishTwoStep(secondCode, rememberDevice));
    },
    cancelTwoStep: () => api.cancelTwoStep(),
    register: async (input) => {
      const user = await api.register(input);
      // A new User: nothing to return to from an earlier User's expired Session.
      returnTo.current = null;
      signedIn(user);
    },
    verifyEmail: async (code) => {
      setState({ kind: "signedIn", user: await api.verifyEmail(code), since: Date.now() });
    },
    reload: async () => {
      try {
        setState({ kind: "signedIn", user: await api.reload(), since: Date.now() });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          queryClient.clear();
          setState({ kind: "expired", returnTo: null });
        } else {
          throw error;
        }
      }
    },
    signOut: async () => {
      await api.signOut();
      queryClient.clear();
      setState({ kind: "signedOut" });
    },
    forget: async () => {
      await api.forget();
      queryClient.clear();
      setState({ kind: "signedOut" });
    },
    signInAgain: () => {
      const path = state.kind === "expired" ? state.returnTo : null;
      // The verify-email screen is no place to come back to: a verified User couldn't open it.
      returnTo.current = path === "/verify-email" ? null : path;
      setState({ kind: "signedOut" });
    },
    retry: restore,
    takeReturnTo: () => {
      const path = returnTo.current;
      returnTo.current = null;
      return path;
    },
  };

  return <SessionContext value={session}>{children}</SessionContext>;
}
