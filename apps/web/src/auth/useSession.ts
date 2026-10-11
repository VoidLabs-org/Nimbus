import { createContext, use } from "react";
import type { LoginInput, RegisterInput, User } from "../api/client";

export type Session = {
  /** The signed-in User, or null when nobody is signed in. */
  user: User | null;
  /** True while the session is being renewed on app load, before anyone knows who is signed in. */
  restoring: boolean;
  /** True when the session could not be checked (rate limit, outage); not the same as signed out. */
  unavailable: boolean;
  /** True after the User chose to sign out, so they go to a plain sign-in page, not one that returns here. */
  signedOutOnPurpose: boolean;
  /** Checks the session again after it was unavailable. */
  retry: () => void;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  /** Changes the signed-in User's display name. Rejects with an ApiError (field errors for 400) if refused. */
  updateDisplayName: (displayName: string) => Promise<void>;
  /** Ends this browser's session. Rejects, leaving the User signed in, if the server can't be reached. */
  logout: () => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
