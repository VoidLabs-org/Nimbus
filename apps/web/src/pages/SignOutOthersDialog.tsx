import { Button } from "@mantine/core";
import type { SessionInfo } from "../api/client";
import { WindowFrame } from "../access/WindowFrame";
import { sessionName } from "../settings/sessionView";
import classes from "./SignOutOthersDialog.module.css";

/** "1 device", "2 devices". */
function devicesText(count: number): string {
  return `${count} ${count === 1 ? "device" : "devices"}`;
}

/**
 * Asks before signing the User out everywhere but here, and names the devices it will sign out so nothing is a
 * surprise (design 32f). Cancel, ✕ and Escape change nothing.
 */
export function SignOutOthersDialog({
  opened,
  others,
  now,
  busy,
  onConfirm,
  onClose,
}: {
  opened: boolean;
  /** The Sessions that would be ended. */
  others: SessionInfo[];
  now: Date;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <WindowFrame
      opened={opened}
      // Not while the request is under way, so its result lands in a dialog that is still there.
      onClose={busy ? () => {} : onClose}
      title="Sign out all other devices?"
      subtitle="You stay signed in on this device. Each one below is signed out the next time it renews its sign-in, within 15 minutes."
    >
      <ul className={classes.list}>
        {others.map((session) => (
          <li key={session.id} className={classes.item}>
            {sessionName(session, now)}
          </li>
        ))}
      </ul>
      <div className={classes.footer}>
        <Button variant="default" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="red" loading={busy} onClick={onConfirm}>
          Sign out {devicesText(others.length)}
        </Button>
      </div>
    </WindowFrame>
  );
}
