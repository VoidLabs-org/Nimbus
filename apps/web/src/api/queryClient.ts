import { QueryClient } from "@tanstack/react-query";

/**
 * The app's cache of server data. Data is shown from the cache at once and refreshed when a page mounts. Failed loads
 * aren't retried behind the page's back (the page says so and offers Try again), and coming back to the window
 * doesn't refetch, so a Role being edited isn't replaced while the User works on it.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
