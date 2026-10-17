import { VisuallyHidden } from "@mantine/core";
import {
  Notifications,
  notifications,
  notificationsStore,
  type NotificationsProps,
} from "@mantine/notifications";
import type { Icon } from "@tabler/icons-react";
import { IconCheck, IconExclamationMark, IconInfoSmall } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Glyph } from "./glyph";

/** How many toasts show at once. A new one always shows; it makes room by closing an older one. */
const LIMIT = 3;

/** Tells the polite live region what to say, while NimbusToasts is on the page. */
let announcePolitely: ((message: string) => void) | undefined;

/**
 * Where the toasts are drawn. Render it once, near the top of the app. Needs Mantine's notification styles
 * (`@mantine/notifications/styles.css`) imported before `themes.css`, as `apps/web/src/main.tsx` does: they place
 * the toasts in their corner, and the Nimbus look is written on top of them.
 *
 * Errors announce themselves (an alert is read out as it appears). The other kinds are read out through one polite
 * live region that stays on the page: screen readers often miss a status region that arrives already filled.
 */
export function NimbusToasts({ position }: Readonly<{ position: NotificationsProps["position"] }>) {
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    announcePolitely = (message) => {
      // Empty first, so the same message said twice is read twice.
      setAnnouncement("");
      setTimeout(() => setAnnouncement(message), 50);
    };
    return () => {
      announcePolitely = undefined;
    };
  }, []);
  // Narrow windows get the full width less a margin (Mantine's own rule).
  return (
    <>
      <Notifications
        position={position}
        limit={LIMIT}
        containerWidth={380}
        className="nimbus-toasts"
        classNames={{ notification: "nimbus-toast" }}
      />
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </>
  );
}

type ToastKind = "success" | "info" | "warning" | "error";

/**
 * Each kind's icon, and how long it stays in ms (errors stay until the User closes them). The icon, not only the
 * colour, tells the kinds apart; warning and error share "!", and errors also have a red edge and stay.
 */
const KINDS: Record<ToastKind, { icon: Icon; closesAfter: number | false }> = {
  success: { icon: IconCheck, closesAfter: 4_000 },
  info: { icon: IconInfoSmall, closesAfter: 4_000 },
  warning: { icon: IconExclamationMark, closesAfter: 6_000 },
  error: { icon: IconExclamationMark, closesAfter: false },
};

/** A toast's id names its kind and message, so the same message is shown once however often it happens. */
const toastId = (kind: ToastKind, message: string) => `toast-${kind}-${message}`;

/**
 * Closes one toast when all the places are taken: the oldest that isn't an error, or the oldest error if every
 * toast is one. A new toast must never wait behind errors nobody has closed yet.
 */
function makeRoom() {
  const open = notificationsStore.getState().notifications;
  if (open.length < LIMIT) return;
  const oldest = open.find((item) => !item.id?.startsWith("toast-error-")) ?? open[0];
  if (oldest?.id) notifications.hide(oldest.id);
}

function show(kind: ToastKind, message: string) {
  const id = toastId(kind, message);
  if (notificationsStore.getState().notifications.some((item) => item.id === id)) return;
  makeRoom();
  const error = kind === "error";
  notifications.show({
    id,
    message,
    icon: <Glyph icon={KINDS[kind].icon} size={kind === "info" ? 22 : 16} />,
    autoClose: KINDS[kind].closesAfter,
    mod: { kind },
    // An error is an alert, read out at once. The rest are read out by NimbusToasts' polite region instead.
    role: error ? "alert" : "none",
    closeButtonProps: { "aria-label": "Close" },
  });
  if (!error) announcePolitely?.(message);
}

/**
 * Short messages after an action, in the Nimbus style (design 24a): a pill with a round status icon, the message
 * and a close button. Say what happened, not which colour to use.
 *
 *     toast.success("Display name saved.");
 *     toast.error("Couldn't save. Try again.");
 */
export const toast = {
  /** An action worked. Closes on its own. */
  success: (message: string) => show("success", message),
  /** Something to know. Closes on its own. */
  info: (message: string) => show("info", message),
  /** It worked, but with a caveat. Stays a little longer. */
  warning: (message: string) => show("warning", message),
  /** An action failed. Stays until closed, and a screen reader says it at once. */
  error: (message: string) => show("error", message),
  /** Closes every toast. */
  clear() {
    notifications.clean();
  },
};
