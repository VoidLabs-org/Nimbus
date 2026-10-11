import { Button, Divider, Stack } from "@mantine/core";

/**
 * "Continue with Google" and "Continue with GitHub", for the sign-in and register pages: signing up and signing in
 * are the same step with a provider. Full page loads, not fetches: the browser must follow the redirects through
 * the provider and back.
 */
export function ProviderButtons() {
  return (
    <>
      <Divider label="or" labelPosition="center" my="md" />
      <Stack gap="xs">
        <Button component="a" href="/api/auth/oauth2/google" variant="default" fullWidth>
          Continue with Google
        </Button>
        <Button component="a" href="/api/auth/oauth2/github" variant="default" fullWidth>
          Continue with GitHub
        </Button>
      </Stack>
    </>
  );
}
