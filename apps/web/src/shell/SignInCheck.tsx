import { VisuallyHidden } from "@mantine/core";
import { useEffect, useState } from "react";
import { NimbusLogo } from "./NimbusLogo";
import classes from "./SignInCheck.module.css";

const ANNOUNCE_AFTER_MS = 100;

/**
 * What fills the window while the app finds out who is signed in, on load and when the browser comes back from
 * Google or GitHub: the Nimbus logo breathing on the plain page background, with a line of text and a sliding bar
 * under it. Nothing is known yet, so there is no layout to sketch. The message says what is happening: "Signing you
 * in" suits the return from a provider, "Checking your session" a page load that may find nobody signed in.
 */
export function SignInCheck({ message = "Signing you in" }: { message?: string }) {
  // Said to screen readers a moment after the page appears: a live region announces changes to text, and one that
  // is mounted with its text is often not announced at all.
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(message), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className={classes.page}>
      <div className={classes.content}>
        <div className={classes.logo}>
          <NimbusLogo size={96} />
        </div>
        <p className={classes.text} aria-hidden>
          {message}
        </p>
        <div className={classes.track} aria-hidden>
          <div className={classes.bar} />
        </div>
      </div>
      <VisuallyHidden role="status">{announced}</VisuallyHidden>
    </div>
  );
}
