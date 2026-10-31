import { ApiError } from "@repo/api";
import { Button, Group, Loader, VisuallyHidden } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../api/client";
import { useProviders } from "../api/queries";
import { BrowserSignInWait } from "./BrowserSignInWait";
import { browserSignInBridge, useBrowserSignIn } from "./useBrowserSignIn";
import classes from "./ProviderButtons.module.css";
import { PROVIDERS } from "./providers";
import { goTo } from "./redirect";
import { returnToSearch, safeReturnPath } from "./returnPath";

// How long the buttons stay busy if the browser hasn't left by then.
const GIVE_UP_AFTER_MS = 10_000;

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
 * In the Desktop app the provider opens in the system browser instead (ADR 0008): the window waits with
 * {@link BrowserSignInWait}, then trades the code the browser handed back for the sign-in and carries on as the
 * browser would have, at `/auth/callback`, `/login/two-step` or the sign-in page with the error.
 */
export function ProviderButtons() {
  // Undefined until the server answers; a failure counts as none (the form below still works).
  const providers = useProviders();
  const enabled = providers.isPending ? null : (providers.data ?? []);
  // The provider the User chose, from the click until the browser leaves.
  const [going, setGoing] = useState<{ id: string; name: string } | null>(null);
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const query = returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  const navigate = useNavigate();
  const browser = useBrowserSignIn();
  // The provider whose code the Desktop app is trading in, after the browser came back.
  const [finishing, setFinishing] = useState<{ id: string; name: string } | null>(null);
  const busy = going ?? finishing;

  async function signInThroughBrowser(provider: { id: string; name: string }) {
    const result = await browser.run(provider.id);
    if (result.outcome === "cancelled") return;
    // As the server does in a browser: back to the sign-in page, saying why, with the page to return to kept.
    const failed = (error: string) => {
      const params = new URLSearchParams({ error, provider: provider.id });
      if (returnTo !== "/") params.set("returnTo", returnTo);
      void navigate(`/login?${params}`, { replace: true });
    };
    if (result.outcome === "error") return failed(result.error);
    setFinishing(provider);
    try {
      const { twoStepRequired } = await api.desktopExchange(result.code, result.verifier);
      if (twoStepRequired) {
        void navigate({ pathname: "/login/two-step", search: returnToSearch(returnTo) });
        return;
      }
      // The refresh cookie is set: a fresh load turns it into the session, as after a browser's callback.
      goTo(`/auth/callback${query}`);
    } catch (error) {
      setFinishing(null);
      failed(error instanceof ApiError && error.code ? error.code : "failed");
    }
  }

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
            loading={busy?.id === provider.id}
            disabled={busy !== null && busy.id !== provider.id}
            onClick={(event) => {
              // Disabled doesn't stop a link: while one provider is under way, the others (and a second click) do nothing.
              if (busy !== null || browser.waitingFor !== null) return event.preventDefault();
              if (browserSignInBridge()) {
                event.preventDefault();
                void signInThroughBrowser(provider);
                return;
              }
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
      {busy === null ? (
        <div className={classes.or}>or</div>
      ) : (
        <div className={`${classes.or} ${classes.going}`} aria-hidden>
          <Loader size={14} />
          {going ? `Taking you to ${going.name}…` : "Signing you in…"}
        </div>
      )}
      {/* Always there, so a change to its text is announced (a region that appears with its text often isn't). */}
      <VisuallyHidden role="status">
        {going ? `Taking you to ${going.name}` : finishing ? "Signing you in" : ""}
      </VisuallyHidden>
      <BrowserSignInWait provider={browser.waitingFor} />
    </>
  );
}
