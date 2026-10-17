/** The sign-in page, remembering where to go once signed in. */
export function loginPath(returnTo: string): string {
  return returnTo === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/** The page saying the session expired, remembering where to go once signed in again. */
export function sessionExpiredPath(returnTo: string): string {
  return returnTo === "/"
    ? "/session-expired"
    : `/session-expired?returnTo=${encodeURIComponent(returnTo)}`;
}

const SAME_ORIGIN = "https://nimbus.invalid";

/**
 * Where to go after signing in. Only paths inside this app are followed, so a crafted link can't send a
 * freshly signed-in User to another site. Parsed as a URL, because browsers also read tricks like
 * "/\t/evil.com" as another host.
 */
export function safeReturnPath(returnTo: string | null): string {
  if (!returnTo?.startsWith("/")) return "/";
  try {
    const url = new URL(returnTo, SAME_ORIGIN);
    return url.origin === SAME_ORIGIN ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}
