import { createContext, use } from "react";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  TwoStepAnswer,
  User,
} from "../api/client";

export type Session = {
  /** The signed-in User, or null when nobody is signed in. */
  user: User | null;
  /** True while the session is being renewed on app load, before anyone knows who is signed in. */
  restoring: boolean;
  /**
   * Why the session could not be checked, or null when it could: "offline" when the request never reached the server,
   * "server" for anything else (rate limit, outage). Not the same as signed out.
   */
  unavailable: "offline" | "server" | null;
  /** True after the User chose to sign out, so they go to a plain sign-in page, not one that returns here. */
  signedOutOnPurpose: boolean;
  /**
   * Where the sign-in page brings the User back to after a sign-out that was a step on the way back ("Sign in
   * again"); null after a plain sign-out.
   */
  returnAfterSignOut: string | null;
  /** Checks the session again after it was unavailable. */
  retry: () => void;
  register: (input: RegisterInput) => Promise<void>;
  /**
   * Signs in with email and password. Resolves to "two-step" when the User has Two-step verification and must still
   * enter a Sign-in code with {@link signInWithCode}; nobody is signed in until then.
   */
  login: (input: LoginInput) => Promise<"signed-in" | "two-step">;
  /**
   * Finishes a password sign-in with a Sign-in code or a Recovery code, remembering this browser for 30 days when
   * `rememberBrowser`. Rejects with an ApiError if refused (see `api.signInWithCode`).
   */
  signInWithCode: (answer: TwoStepAnswer, rememberBrowser?: boolean) => Promise<void>;
  /** Changes the signed-in User's display name. Rejects with an ApiError (field errors for 400) if refused. */
  updateDisplayName: (displayName: string) => Promise<void>;
  /**
   * Changes the signed-in User's email to the address the code was sent to. Rejects with an ApiError (see
   * `api.confirmEmailChange`) if refused.
   */
  changeEmail: (code: string) => Promise<void>;
  /**
   * Uploads `picture` as the signed-in User's Profile picture, which then shows everywhere at once. Rejects with an
   * ApiError (see `api.uploadProfilePicture`) if refused.
   */
  uploadProfilePicture: (picture: Blob) => Promise<void>;
  /** Sets or changes the signed-in User's password. Rejects with an ApiError (field errors for 400, 429 when blocked) if refused. */
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  /**
   * Checks the Verification code the signed-in User typed. Rejects with an ApiError ("invalid_code" with
   * `triesLeft`, or "code_expired") if refused; on success the User is verified and the screen confirms it, then the app opens.
   */
  verifyEmail: (code: string) => Promise<void>;
  /** True from a correct code until {@link finishVerifying}: the verification screen stays up to confirm it. */
  confirmingEmail: boolean;
  /** Closes the confirmation, which opens the app. */
  finishVerifying: () => void;
  /**
   * Ends this browser's session. Rejects, leaving the User signed in, if the server can't be reached. With
   * `returnTo`, the sign-in page it leads to brings the User back there.
   */
  logout: (returnTo?: string) => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
