import { Button } from "@mantine/core";
import { WindowFrame } from "../access/WindowFrame";
import classes from "./DisconnectDialogs.module.css";

/**
 * Asks the User to sign in again before something that needs a recent sign-in (connecting a provider, setting up
 * two-step verification), because theirs is too old. Both add a way into the account, or change how it is guarded,
 * so a stolen access token alone must not be enough. Confirming signs out and goes to the sign-in page, which
 * brings the User back to the Security page.
 */
export function ReauthDialog({
  opened,
  title,
  subtitle,
  busy,
  onConfirm,
  onClose,
}: {
  opened: boolean;
  /** E.g. "Sign in again to connect Google"; kept while the window fades out. */
  title: string;
  subtitle: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={opened}
      onClose={busy ? () => {} : onClose}
      title={title}
      subtitle={subtitle}
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
