import { Button } from "@mantine/core";
import { Link } from "react-router";
import { WindowFrame } from "../access/WindowFrame";
import classes from "./DisconnectDialogs.module.css";

/**
 * Asks before a provider stops signing in as the User (design 32g). Cancel, ✕ and Escape change nothing.
 */
export function DisconnectDialog({
  provider,
  busy,
  onConfirm,
  onClose,
}: {
  /** The provider's display name, e.g. "Google"; null while the dialog is closed. */
  provider: string | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={provider !== null}
      // Not while the request is under way, so its result lands in a dialog that is still there.
      onClose={busy ? () => {} : onClose}
      title={`Disconnect ${provider ?? ""}?`}
      subtitle={`You won’t be able to sign in with ${provider ?? ""}. You can connect it again any time.`}
    >
      <div className={classes.footer}>
        <Button variant="default" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="red" loading={busy} onClick={onConfirm}>
          Disconnect
        </Button>
      </div>
    </WindowFrame>
  );
}

/**
 * Stops the User disconnecting the only way they can sign in, and points them at setting a password (design 32h).
 */
export function SetPasswordFirstDialog({
  provider,
  onClose,
}: {
  /** The provider's display name, e.g. "Google"; null while the dialog is closed. */
  provider: string | null;
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={provider !== null}
      onClose={onClose}
      title="Set a password first"
      subtitle={`${provider ?? "This account"} is the only way you can sign in right now. Set a password, then you can disconnect it.`}
    >
      <div className={classes.footer}>
        <Button variant="default" onClick={onClose}>
          Not now
        </Button>
        <Button component={Link} to="/settings/password">
          Set a password
        </Button>
      </div>
    </WindowFrame>
  );
}
