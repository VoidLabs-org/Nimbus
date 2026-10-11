/** Text for a 429, using Retry-After when the server sent it. */
export function tooManyAttemptsMessage(retryAfterSeconds: number | null): string {
  if (!retryAfterSeconds) return "Too many attempts. Try again later.";
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Text for the `error` code the server puts on `/login` when "Continue with Google" fails; null when there is none. */
export function providerSignInErrorMessage(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "email_unverified":
      return "Google hasn't verified that email address, so we can't sign you in with it. Verify it with Google, or use another way to sign in.";
    case "cancelled":
      return "Sign-in with Google was cancelled.";
    default:
      return "Something went wrong signing in with Google. Please try again.";
  }
}
