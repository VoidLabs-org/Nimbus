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

// Confirm it's you is shared with the Mobile app.
export { confirmHeading, type ConfirmPhase } from "@repo/api";
