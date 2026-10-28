import { focusManager, QueryClient } from "@tanstack/react-query";

// Query only listens for tab visibility; a window can also regain focus without becoming visible again.
focusManager.setEventListener((handleFocus) => {
  const onChange = () => handleFocus();
  window.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
});

/**
 * The app's cache of server data. Data is shown from the cache at once and refreshed when a page mounts. Failed loads
 * aren't retried behind the page's back (the page says so and offers Try again), and coming back to the window
 * doesn't refetch, so a Role being edited isn't replaced while the User works on it. A change is sent (and fails) at
 * once even when the browser thinks it is offline, so the page can say so; by default it would wait silently.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { networkMode: "always" },
    },
  });
}
