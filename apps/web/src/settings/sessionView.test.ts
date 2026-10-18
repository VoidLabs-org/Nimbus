import { describe, expect, it } from "vitest";
import { activityText, isPhone, sessionName, signedInText } from "./sessionView";

const now = new Date("2026-10-18T12:00:00Z");
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A session the server says was last active this many seconds ago. */
const idle = (idleSeconds: number, current = false) => ({ current, idleSeconds });

describe("activityText", () => {
  it("says Active now within 15 minutes", () => {
    expect(activityText(idle(0))).toBe("Active now");
    expect(activityText(idle(14 * MINUTE))).toBe("Active now");
  });

  it("says Active now for this device however old its last refresh", () => {
    expect(activityText(idle(2 * HOUR, true))).toBe("Active now");
  });

  it("counts whole minutes, hours and days, singular for one", () => {
    expect(activityText(idle(15 * MINUTE))).toBe("Active 15 minutes ago");
    expect(activityText(idle(59 * MINUTE))).toBe("Active 59 minutes ago");
    expect(activityText(idle(HOUR))).toBe("Active 1 hour ago");
    expect(activityText(idle(3 * HOUR + 40 * MINUTE))).toBe("Active 3 hours ago");
    expect(activityText(idle(DAY))).toBe("Active 1 day ago");
    expect(activityText(idle(5 * DAY + 3 * HOUR))).toBe("Active 5 days ago");
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

describe("sessionName", () => {
  it("names a session by its device and when it was signed in", () => {
    const now = new Date("2026-10-18T12:00:00Z");

    expect(
      sessionName({ device: "Chrome on Windows", startedAt: "2026-10-03T12:00:00Z" }, now),
    ).toMatch(/^Chrome on Windows \(signed in .*3.*\)$/);
  });
});
