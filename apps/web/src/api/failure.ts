import { ApiError, NetworkError } from "./client";

/** Which status page a page shows when loading it failed. */
export type FailedLoad = "not-found" | "no-access" | "offline" | "server";

/**
 * Turns a failed load into the status page to show: the server's 404 and 403 have their own pages, a request that
 * never reached the server (a NetworkError) means the connection is down, and anything else, a bug in the app
 * included, gets the server-error page.
 */
export function failedLoad(failure: unknown): FailedLoad {
  if (failure instanceof ApiError) {
    if (failure.status === 404) return "not-found";
    if (failure.status === 403) return "no-access";
    return "server";
  }
  return failure instanceof NetworkError ? "offline" : "server";
}
