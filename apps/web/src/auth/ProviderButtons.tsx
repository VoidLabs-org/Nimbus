import { Button, Group, Loader, VisuallyHidden } from "@mantine/core";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import classes from "./ProviderButtons.module.css";
import { GitHubIcon, GoogleIcon } from "./ProviderIcons";
import { safeReturnPath } from "./returnPath";

// How long the buttons stay busy if the browser hasn't left by then.
const GIVE_UP_AFTER_MS = 10_000;

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
 * Between the click and the browser leaving, the page stays as it was: the clicked button works, the other is held
 * back (its click is cancelled, so it can't take over) and the "or" under them says where the User is being taken,
 * for screen readers too, through a region that is always there. A click that opens the provider in a new tab changes
 * nothing. If the browser never leaves (the User pressed Stop, or it stalled), or comes back with the Back button, the
 * buttons start again.
 */
export function ProviderButtons() {
  // null until the server answers.
  const [enabled, setEnabled] = useState<string[] | null>(null);
  // The provider the User chose, from the click until the browser leaves.
  const [going, setGoing] = useState<{ id: string; name: string } | null>(null);
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const query = returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;

  // The browser may restore this page as it was left when the User comes back: the chosen button must not stay busy.
  useEffect(() => {
    const restored = () => setGoing(null);
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  // Pressing Stop, or a redirect that stalls, leaves the page here without the browser going anywhere.
  useEffect(() => {
    if (going === null) return;
    const timer = setTimeout(() => setGoing(null), GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [going]);

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
            loading={going?.id === provider.id}
            disabled={going !== null && going.id !== provider.id}
            onClick={(event) => {
              // Disabled doesn't stop a link: while one provider is under way, the others (and a second click) do nothing.
              if (going !== null) return event.preventDefault();
              // A click that opens the provider in a new tab leaves this page where it is.
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              setGoing({ id: provider.id, name: provider.name });
            }}
          >
            {provider.name}
          </Button>
        ))}
      </Group>
      {going === null ? (
        <div className={classes.or}>or</div>
      ) : (
        <div className={`${classes.or} ${classes.going}`} aria-hidden>
          <Loader size={14} />
          Taking you to {going.name}…
        </div>
      )}
      {/* Always there, so a change to its text is announced (a region that appears with its text often isn't). */}
      <VisuallyHidden role="status">{going && `Taking you to ${going.name}`}</VisuallyHidden>
    </>
  );
}
