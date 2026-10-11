import { Alert, Button, Center, Loader, Stack } from "@mantine/core";
import { Navigate } from "react-router";
import { useSession } from "../auth/useSession";

/**
 * Where the server sends the browser after "Continue with Google" worked. The server has already set the
 * refresh cookie, and the session provider's refresh on page load turns it into an access token, so this page
 * only waits for that. No token is ever in this page's URL.
 */
export default function AuthCallbackPage() {
  const { user, restoring, unavailable, retry } = useSession();

  if (restoring) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (user) return <Navigate to="/" replace />;
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
  // The cookie was not accepted, so there is no session to continue with.
  return <Navigate to="/login?error=failed" replace />;
}
