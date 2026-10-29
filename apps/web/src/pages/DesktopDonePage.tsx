import { useSearchParams } from "react-router";
import { AuthLayout } from "../auth/AuthLayout";
import classes from "../auth/AuthLayout.module.css";
import { PROVIDERS } from "../auth/providers";

/**
 * Where the browser tab ends after "Continue with Google or GitHub" in the Desktop app (ADR 0008, design "Desktop
 * Sign-in Handoff", signed in): the app took the result, so this tab only says to go back to it, naming the app as the
 * Sessions list does. `provider` is the one the User signed in with; `connect=1` for a connect from Security;
 * `failed=1` when it didn't work, and the app says why; `outdated=1` (from the API) for a tab left behind by "Open the
 * browser again", whose newer tab is still under way. It doesn't say the User is signed in to Nimbus: the app trades
 * the code in after this page opens.
 */
export default function DesktopDonePage() {
  const [searchParams] = useSearchParams();
  const failed = searchParams.has("failed");
  const connecting = searchParams.has("connect");
  const provider = PROVIDERS.find((known) => known.id === searchParams.get("provider"));
  const app = desktopAppName(navigator.userAgent);

  if (searchParams.has("outdated")) {
    return (
      <AuthLayout
        gap={22}
        icon={
          <span className={`${classes.verifiedMark} ${classes.failedMark}`} aria-hidden>
            !
          </span>
        }
        title="Use the newer tab"
        subtitle={`${app} opened the sign-in again in another tab. Finish it there. You can close this tab.`}
      >
        {null}
      </AuthLayout>
    );
  }
  if (failed) {
    return (
      <AuthLayout
        gap={22}
        icon={
          <span className={`${classes.verifiedMark} ${classes.failedMark}`} aria-hidden>
            !
          </span>
        }
        title={connecting ? "Connecting didn’t finish" : "Signing in didn’t finish"}
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
      subtitle={
        connecting && provider
          ? `Nimbus is finishing connecting ${provider.name} there. You can close this tab.`
          : "Nimbus is finishing your sign-in there. You can close this tab."
      }
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
