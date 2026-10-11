import { Button, Divider } from "@mantine/core";

/**
 * "Continue with Google", for the sign-in and register pages: signing up and signing in are the same step
 * with a provider. A full page load, not a fetch: the browser must follow the redirects through Google and back.
 */
export function GoogleButton() {
  return (
    <>
      <Divider label="or" labelPosition="center" my="md" />
      <Button component="a" href="/api/auth/oauth2/google" variant="default" fullWidth>
        Continue with Google
      </Button>
    </>
  );
}
