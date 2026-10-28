import { describe, expect, it } from "vitest";
import { passwordChangedText } from "./profileView";

const now = new Date("2026-10-24T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("passwordChangedText", () => {
  it("says just now within a minute", () => {
    expect(passwordChangedText(ago(0), now)).toBe("Last changed just now");
    expect(passwordChangedText(ago(59), now)).toBe("Last changed just now");
  });

  it("counts whole minutes, hours, days, months and years, singular for one", () => {
    expect(passwordChangedText(ago(MINUTE), now)).toBe("Last changed 1 minute ago");
    expect(passwordChangedText(ago(5 * HOUR + 10 * MINUTE), now)).toBe("Last changed 5 hours ago");
    expect(passwordChangedText(ago(DAY), now)).toBe("Last changed 1 day ago");
    expect(passwordChangedText(ago(29 * DAY), now)).toBe("Last changed 29 days ago");
    expect(passwordChangedText(ago(30 * DAY), now)).toBe("Last changed 1 month ago");
    expect(passwordChangedText(ago(95 * DAY), now)).toBe("Last changed 3 months ago");
    expect(passwordChangedText(ago(365 * DAY), now)).toBe("Last changed 1 year ago");
    expect(passwordChangedText(ago(800 * DAY), now)).toBe("Last changed 2 years ago");
  });

  it("says just now when this computer's clock is behind the server's", () => {
    expect(passwordChangedText(ago(-5 * MINUTE), now)).toBe("Last changed just now");
  });
});
