import { NimbusLogo } from "./NimbusLogo";
import classes from "./SignInCheck.module.css";

/**
 * What fills the window while the app finds out who is signed in, on load and when the browser comes back from
 * Google or GitHub: the Nimbus logo breathing on the plain page background, with "Signing you in" and a sliding
 * bar under it. Nothing is known yet, so there is no layout to sketch.
 */
export function SignInCheck() {
  return (
    <div className={classes.page} role="status">
      <div className={classes.content}>
        <div className={classes.logo}>
          <NimbusLogo size={96} />
        </div>
        <p className={classes.text}>Signing you in</p>
        <div className={classes.track} aria-hidden>
          <div className={classes.bar} />
        </div>
      </div>
    </div>
  );
}
