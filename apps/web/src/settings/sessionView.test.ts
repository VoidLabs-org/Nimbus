import { describe, expect, it } from "vitest";
import { activityText, isPhone, signedInText } from "./sessionView";

const now = new Date("2026-10-18T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("activityText", () => {
  it("says Active now within 15 minutes", () => {
    expect(activityText({ current: false, lastActiveAt: ago(0) }, now)).toBe("Active now");
    expect(activityText({ current: false, lastActiveAt: ago(14 * MINUTE) }, now)).toBe(
      "Active now",
    );
  });

  it("says Active now for this device however old its last refresh", () => {
    expect(activityText({ current: true, lastActiveAt: ago(2 * HOUR) }, now)).toBe("Active now");
  });

  it("counts whole minutes, hours and days, singular for one", () => {
    expect(activityText({ current: false, lastActiveAt: ago(15 * MINUTE) }, now)).toBe(
      "Active 15 minutes ago",
    );
    expect(activityText({ current: false, lastActiveAt: ago(59 * MINUTE) }, now)).toBe(
      "Active 59 minutes ago",
    );
    expect(activityText({ current: false, lastActiveAt: ago(HOUR) }, now)).toBe(
      "Active 1 hour ago",
    );
    expect(activityText({ current: false, lastActiveAt: ago(3 * HOUR + 40 * MINUTE) }, now)).toBe(
      "Active 3 hours ago",
    );
    expect(activityText({ current: false, lastActiveAt: ago(DAY) }, now)).toBe("Active 1 day ago");
    expect(activityText({ current: false, lastActiveAt: ago(5 * DAY + 3 * HOUR) }, now)).toBe(
      "Active 5 days ago",
    );
  });

  it("does not go negative when the clocks disagree a little", () => {
    expect(activityText({ current: false, lastActiveAt: ago(-2 * MINUTE) }, now)).toBe(
      "Active now",
    );
  });
});

describe("signedInText", () => {
  it("gives the day and month for a sign-in this year", () => {
    const text = signedInText("2026-10-12T08:00:00Z", now);

    expect(text).toMatch(/^Signed in /);
    expect(text).toContain("12");
    expect(text).toContain("Oct");
    expect(text).not.toContain("2026");
  });

  it("adds the year for an earlier year", () => {
    expect(signedInText("2025-12-30T12:00:00Z", now)).toContain("2025");
  });
});

describe("isPhone", () => {
  it("is true for phones and tablets, from the label", () => {
    expect(isPhone("Safari on iOS")).toBe(true);
    expect(isPhone("Chrome on Android")).toBe(true);
  });

  it("is false for everything else, including an unknown browser", () => {
    expect(isPhone("Chrome on Windows")).toBe(false);
    expect(isPhone("Unknown browser")).toBe(false);
  });
});
