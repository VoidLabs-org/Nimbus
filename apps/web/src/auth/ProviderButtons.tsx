import { Button, Group } from "@mantine/core";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import classes from "./ProviderButtons.module.css";
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
 * loads, not fetches: the browser must follow the redirects through the provider and back. Until the server has
 * said which are on, an invisible row holds their place, so the form below doesn't jump when they appear. Nothing
 * shows, not even the "or", when none are on or the server can't be asked: the form still works. The page's `returnTo` goes along; the server keeps it through the handshake and hands it to
 * `/auth/callback`.
 */
export function ProviderButtons() {
  // null until the server answers.
  const [enabled, setEnabled] = useState<string[] | null>(null);
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
      .catch(() => {
        if (current) setEnabled([]);
      });
    return () => {
      current = false;
    };
  }, []);

  if (enabled === null) {
    return (
      <>
        <div className={`${classes.provider} ${classes.pending}`} aria-hidden />
        <div className={`${classes.or} ${classes.pending}`} aria-hidden>
          or
        </div>
      </>
    );
  }

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
