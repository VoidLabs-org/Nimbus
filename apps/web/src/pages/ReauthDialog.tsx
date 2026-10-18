import { Button } from "@mantine/core";
import { WindowFrame } from "../access/WindowFrame";
import classes from "./DisconnectDialogs.module.css";

/**
 * Asks the User to sign in again before connecting a provider, because their sign-in is too old. Connecting adds
 * a way into the account that outlives the browser, so a stolen access token alone must not be enough. Confirming
 * signs out and goes to the sign-in page, which brings the User back to the Security page.
 */
export function ReauthDialog({
  opened,
  provider,
  busy,
  onConfirm,
  onClose,
}: {
  opened: boolean;
  /** The provider's display name, e.g. "Google"; kept while the window fades out. */
  provider: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={opened}
      onClose={busy ? () => {} : onClose}
      title={`Sign in again to connect ${provider}`}
      subtitle="For your security, connecting an account needs a recent sign-in. You’ll come back to this page afterwards."
    >
      <div className={classes.footer}>
        <Button variant="default" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} onClick={onConfirm}>
          Sign in again
        </Button>
      </div>
    </WindowFrame>
  );
}
