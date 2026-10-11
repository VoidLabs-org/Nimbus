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
    case "cancelled":
      return `Sign-in with ${name ?? "your provider"} was cancelled.`;
    default:
      return `Something went wrong signing in with ${name ?? "your provider"}. Please try again.`;
  }
}
