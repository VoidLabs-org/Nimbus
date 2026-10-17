import { Button, Group } from "@mantine/core";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import classes from "./AuthLayout.module.css";
import { GitHubIcon, GoogleIcon } from "./ProviderIcons";
import { safeReturnPath } from "./returnPath";

// What each provider id from the server looks like here. An id not listed is not shown.
const PROVIDERS = [
  { id: "google", name: "Google", icon: <GoogleIcon /> },
  { id: "github", name: "GitHub", icon: <GitHubIcon /> },
];

/**
 * "Continue with ..." for each provider the server has switched on, for the sign-in and register pages: signing
 * up and signing in are the same step with a provider. They sit side by side above the form, then "or". Full page
 * loads, not fetches: the browser must follow the redirects through the provider and back. Nothing shows, not even
 * the "or", until the server has said which are on, when none are, or when it can't be asked: the form below still
 * works. The page's `returnTo` goes along; the server keeps it through the handshake and hands it to
 * `/auth/callback`.
 */
export function ProviderButtons() {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const query = returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;

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
      <Group grow gap={10}>
        {shown.map((provider) => (
          <Button
            key={provider.id}
            component="a"
            href={`/api/auth/oauth2/${provider.id}${query}`}
            variant="default"
            className={classes.provider}
            leftSection={provider.icon}
            aria-label={`Continue with ${provider.name}`}
          >
            {provider.name}
          </Button>
        ))}
      </Group>
      <div className={classes.or}>or</div>
    </>
  );
}
