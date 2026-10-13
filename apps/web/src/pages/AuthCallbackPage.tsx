import { Alert, Button, Center, Loader, Stack } from "@mantine/core";
import { Navigate, useSearchParams } from "react-router";
import { safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

/**
 * Where the server sends the browser after "Continue with Google" or "Continue with GitHub" worked. The server has already set the
 * refresh cookie, and the session provider's refresh on page load turns it into an access token, so this page
 * only waits for that, then goes to the `returnTo` page the sign-in started from. No token is ever in this page's
 * URL.
 */
export default function AuthCallbackPage() {
  const { user, restoring, unavailable, retry } = useSession();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  if (restoring) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (user) return <Navigate to={returnTo} replace />;
  if (unavailable) {
    return (
      <Center h="100vh" p="md">
        <Stack align="center">
          <Alert color="yellow">We couldn't finish signing you in. Please try again.</Alert>
          <Button onClick={retry}>Try again</Button>
        </Stack>
      </Center>
    );
  }
  // The cookie was not accepted, so there is no session to continue with. The page is kept for the next try.
  const failed = new URLSearchParams({ error: "failed" });
  if (returnTo !== "/") failed.set("returnTo", returnTo);
  return <Navigate to={`/login?${failed}`} replace />;
}
