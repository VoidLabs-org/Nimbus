import { useSearchParams } from "react-router";
import { AuthLayout } from "../auth/AuthLayout";
import classes from "../auth/AuthLayout.module.css";
import { PROVIDERS } from "../auth/providers";

/**
 * Where the browser tab ends after "Continue with Google or GitHub" in the Desktop app (ADR 0008, design "Desktop
 * Sign-in Handoff", signed in): the app took the result, so this tab only says to go back to it, naming the app as the
 * Sessions list does. `provider` is the one the User signed in with; `?failed=1` when the sign-in didn't work, and the
 * app says why. It doesn't say the User is signed in to Nimbus: the app trades the code in after this page opens.
 */
export default function DesktopDonePage() {
  const [searchParams] = useSearchParams();
  const failed = searchParams.has("failed");
  const provider = PROVIDERS.find((known) => known.id === searchParams.get("provider"));
  const app = desktopAppName(navigator.userAgent);

  if (failed) {
    return (
      <AuthLayout
        gap={22}
        icon={
          <span className={`${classes.verifiedMark} ${classes.failedMark}`} aria-hidden>
            !
          </span>
        }
        title="Signing in didn’t finish"
        subtitle={`Go back to ${app} and try again. You can close this tab.`}
      >
        {null}
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      gap={22}
      icon={
        <span className={classes.verifiedMark} aria-hidden>
          ✓
        </span>
      }
      title={`Continue in ${app}`}
      subtitle="Nimbus is finishing your sign-in there. You can close this tab."
    >
      {provider && (
        <div className={classes.handoffStep}>
          <span className={classes.handoffIcon} aria-hidden>
            {provider.icon}
          </span>
          <span className={classes.handoffLabel}>Signed in with {provider.name}</span>
          <span className={classes.handoffCheck} aria-hidden>
            ✓
          </span>
        </div>
      )}
    </AuthLayout>
  );
}

/** "Nimbus for Mac", "Nimbus for Windows" or "Nimbus for Linux", like the Sessions list; the browser is on the same computer. */
function desktopAppName(userAgent: string): string {
  if (/Windows/.test(userAgent)) return "Nimbus for Windows";
  if (/Macintosh|Mac OS X/.test(userAgent) && !/iPhone|iPad/.test(userAgent))
    return "Nimbus for Mac";
  if (/Linux|X11/.test(userAgent) && !/Android/.test(userAgent)) return "Nimbus for Linux";
  return "the Nimbus Desktop app";
}
