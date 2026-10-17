import { Notifications, notifications, type NotificationsProps } from "@mantine/notifications";
import type { Icon } from "@tabler/icons-react";
import { IconCheck, IconExclamationMark, IconInfoSmall } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Glyph } from "./glyph";

/**
 * Where the toasts are drawn. Render it once, near the top of the app. At most three show at once; the rest wait
 * their turn.
 */
export function NimbusToasts({ position }: Readonly<{ position: NotificationsProps["position"] }>) {
  // Narrow windows get the full width less a margin (Mantine's own rule).
  return (
    <Notifications position={position} limit={3} containerWidth={380} className="nimbus-toasts" />
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

function show(kind: ToastKind, message: ReactNode) {
  const error = kind === "error";
  notifications.show({
    message,
    icon: <Glyph icon={KINDS[kind].icon} size={kind === "info" ? 22 : 16} />,
    autoClose: KINDS[kind].closesAfter,
    className: "nimbus-toast",
    mod: { kind },
    // Errors interrupt a screen reader; the rest wait their turn.
    role: error ? "alert" : "status",
    "aria-live": error ? "assertive" : "polite",
    closeButtonProps: { "aria-label": "Close" },
  });
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
  success: (message: ReactNode) => show("success", message),
  /** Something to know. Closes on its own. */
  info: (message: ReactNode) => show("info", message),
  /** It worked, but with a caveat. Stays a little longer. */
  warning: (message: ReactNode) => show("warning", message),
  /** An action failed. Stays until closed, and a screen reader says it at once. */
  error: (message: ReactNode) => show("error", message),
  /** Closes every toast. */
  clear() {
    notifications.clean();
  },
};
