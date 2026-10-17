import { describe, expect, it } from "vitest";
import { DESTINATIONS, OTHER_FOCUS_KEYS } from "./navigation";

describe("DESTINATIONS", () => {
  it("lists Home, then Settings", () => {
    expect(DESTINATIONS.map((d) => [d.id, d.to, d.label])).toEqual([
      ["home", "/", "Home"],
      ["settings", "/settings", "Settings"],
    ]);
  });

  it("names each control once, apart from the navbar's other controls, so focus goes back to the right one", () => {
    const ids: string[] = DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of OTHER_FOCUS_KEYS) expect(ids).not.toContain(key);
  });
});
