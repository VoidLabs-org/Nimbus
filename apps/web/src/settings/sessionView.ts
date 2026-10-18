import type { SessionInfo } from "../api/client";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A session counts as in use for this long after it last got a new sign-in token, which the app renews about every 15 minutes. */
const ACTIVE_NOW = 15 * MINUTE;

function counted(amount: number, unit: string): string {
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/** "Active now", or how long ago the session was last used ("Active 3 hours ago"). This device is always active now. */
export function activityText(
  session: Pick<SessionInfo, "current" | "lastActiveAt">,
  now: Date,
): string {
  const idle = now.getTime() - new Date(session.lastActiveAt).getTime();
  if (session.current || idle < ACTIVE_NOW) return "Active now";
  if (idle < HOUR) return `Active ${counted(Math.floor(idle / MINUTE), "minute")} ago`;
  if (idle < DAY) return `Active ${counted(Math.floor(idle / HOUR), "hour")} ago`;
  return `Active ${counted(Math.floor(idle / DAY), "day")} ago`;
}

/** "Signed in 12 Oct", in the viewer's locale, with the year only when it isn't this one. */
export function signedInText(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  const date = started.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(started.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `Signed in ${date}`;
}

/** Whether the label names a phone or tablet, which gets the phone icon. */
export function isPhone(device: string): boolean {
  return / on (iOS|Android)$/.test(device);
}
