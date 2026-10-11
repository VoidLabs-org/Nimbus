/** Text for a 429, using Retry-After when the server sent it. */
export function tooManyAttemptsMessage(retryAfterSeconds: number | null): string {
  if (!retryAfterSeconds) return "Too many attempts. Try again later.";
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
