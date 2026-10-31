import { clock } from "./clock";
import { ApiError, NetworkError } from "./errors";

/** For a failure the page has nothing more specific to say about. */
export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** For a request that couldn't reach the server (a NetworkError). */
export const NETWORK_ERROR = "Can’t reach Nimbus. Check your connection and try again.";

/** How long Resend stays off after an emailed code is sent, matching the server's 60 seconds between emails. */
export const RESEND_WAIT_SECONDS = 60;

/**
 * A Sign-in code the server refused: `invalid_code` in a Security page window, `invalid_two_step_code` on the
 * forgot-password page (where `invalid_code` is about the Reset code).
 */
export const WRONG_SIGN_IN_CODE =
  "That code didn’t work. Check your authenticator app and try again.";

/**
 * A Recovery code the server refused, wrong or used already: `invalid_code` when signing in or removing Two-step
 * verification, `invalid_two_step_code` on the forgot-password page (where `invalid_code` is about the Reset code).
 */
export const WRONG_RECOVERY_CODE = "That recovery code isn’t right, or it was used already.";

/**
 * An emailed code the server refused (`invalid_code`): a Verification code or a Reset code, with the `triesLeft` it
 * sent.
 */
export function wrongCodeMessage(triesLeft: number | null): string {
  return triesLeft === null
    ? "That code isn’t right."
    : `That code isn’t right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/** What to tell the User when checking their Verification code failed. */
export function verificationCodeMessage(error: unknown): string {
  if (error instanceof NetworkError) return NETWORK_ERROR;
  if (error instanceof ApiError) {
    if (error.code === "invalid_code") return wrongCodeMessage(error.triesLeft);
    if (error.code === "code_expired") {
      return "That code has expired, or was cancelled after too many wrong tries.";
    }
    if (error.status === 429) return tooManyAttemptsMessage(error.retryAfterSeconds);
  }
  return GENERIC_ERROR;
}

/** On the sign-in page, after a Two-step verification sign-in ended (`sign_in_expired`). */
export const SIGN_IN_TIMED_OUT = "Your sign-in timed out. Sign in again.";

/**
 * Text for the `error` code (and the `provider` it is about) the server puts on `/settings/security` when
 * connecting a provider fails. Unknown codes get the generic text, and an unknown provider is not echoed.
 */
export function connectErrorMessage(code: string, provider: string | null): string {
  const name = providerName(provider);
  switch (code) {
    case "already_linked":
      return `That ${name ?? "provider"} account is already connected to another Nimbus account.`;
    case "already_connected":
      return `You already have a ${name ?? "provider"} account connected. Disconnect it first to connect another.`;
    case "email_unverified":
      return name
        ? `Your ${name} account needs a verified email address. Verify it with ${name}, then try again.`
        : "Your account needs a verified email address. Verify it with your provider, then try again.";
    case "cancelled":
      return `Connecting ${name ?? "your provider"} was cancelled.`;
    case "expired":
      return `That took too long. Try connecting ${name ?? "your provider"} again.`;
    default:
      return `Something went wrong connecting ${name ?? "your provider"}. Please try again.`;
  }
}

/** Text for a 429 whose wait is shown counting down, e.g. "0:42". */
export function tooManyAttemptsIn(seconds: number): string {
  return `Too many attempts. Try again in ${clock(seconds)}.`;
}

/** Text for a 429, using Retry-After when the server sent it. */
export function tooManyAttemptsMessage(retryAfterSeconds: number | null): string {
  if (!retryAfterSeconds) return "Too many attempts. Try again later.";
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** The provider's display name for the `provider` the server puts on `/login`; anything unknown is not echoed back. */
function providerName(provider: string | null): string | null {
  switch (provider) {
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    default:
      return null;
  }
}

/**
 * Text for the `error` code (and the `provider` it is about) the server puts on `/login` when "Continue with ..."
 * fails; null when there is no error.
 */
export function providerSignInErrorMessage(
  code: string | null,
  provider: string | null = null,
): string | null {
  const name = providerName(provider);
  switch (code) {
    case null:
      return null;
    case "email_unverified":
      return name
        ? `Your ${name} account needs a verified email address. Verify it with ${name}, or use another way to sign in.`
        : "Your account needs a verified email address. Verify it with your sign-in provider, or use another way to sign in.";
    case "disconnected":
      return `You disconnected ${name ?? "this provider"} from your Nimbus account. Sign in another way, then connect it again from Security.`;
    case "cancelled":
      return `Sign-in with ${name ?? "your provider"} was cancelled.`;
    case "expired":
      return `That took too long. Try signing in with ${name ?? "your provider"} again.`;
    default:
      return `Something went wrong signing in with ${name ?? "your provider"}. Please try again.`;
  }
}
