const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function counted(amount: number, unit: string): string {
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/**
 * The Password row's "Last changed 3 months ago" (design 39a), or "just now" (39p). A time ahead of this computer's
 * clock, which is behind the server's, also counts as just now.
 */
export function passwordChangedText(changedAt: string, now: Date): string {
  const seconds = Math.floor((now.getTime() - new Date(changedAt).getTime()) / 1000);
  const ago = (amount: number, unit: string) => `Last changed ${counted(amount, unit)} ago`;
  if (seconds < MINUTE) return "Last changed just now";
  if (seconds < HOUR) return ago(Math.floor(seconds / MINUTE), "minute");
  if (seconds < DAY) return ago(Math.floor(seconds / HOUR), "hour");
  if (seconds < MONTH) return ago(Math.floor(seconds / DAY), "day");
  if (seconds < YEAR) return ago(Math.floor(seconds / MONTH), "month");
  return ago(Math.floor(seconds / YEAR), "year");
}

/** Step 1 asks for the password (39b), then, with Two-step verification, a Sign-in code or a Recovery code (39c). */
export type ConfirmPhase = "password" | "secondCode";

/** The window's title and the line under it for each phase. */
export function confirmHeading(phase: ConfirmPhase, recovery: boolean) {
  return phase === "password"
    ? {
        title: "Confirm it’s you",
        subtitle: "You signed in a while ago. Enter your password to keep going.",
      }
    : {
        title: "Enter your Sign-in code",
        subtitle: recovery
          ? "Two-step verification is on. Enter one of the recovery codes you saved."
          : "Two-step verification is on. Enter the 6-digit code from your authenticator app.",
      };
}
