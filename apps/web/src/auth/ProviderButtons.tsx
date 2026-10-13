import { Button, Divider, Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../api/client";

// What each provider id from the server looks like here. An id not listed is not shown.
const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

/**
 * "Continue with ..." for each provider the server has switched on, for the sign-in and register pages: signing
 * up and signing in are the same step with a provider. Full page loads, not fetches: the browser must follow
 * the redirects through the provider and back. Nothing shows, not even the divider, until the server has said
 * which are on, when none are, or when it can't be asked: the form above still works.
 */
export function ProviderButtons() {
  const [enabled, setEnabled] = useState<string[]>([]);

  useEffect(() => {
    let current = true;
    api
      .providers()
      .then((ids) => {
        if (current) setEnabled(ids);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  const shown = PROVIDERS.filter((provider) => enabled.includes(provider.id));
  if (shown.length === 0) return null;

  return (
    <>
      <Divider label="or" labelPosition="center" my="md" />
      <Stack gap="xs">
        {shown.map((provider) => (
          <Button
            key={provider.id}
            component="a"
            href={`/api/auth/oauth2/${provider.id}`}
            variant="default"
            fullWidth
          >
            {provider.label}
          </Button>
        ))}
      </Stack>
    </>
  );
}
