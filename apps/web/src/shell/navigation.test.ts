import { describe, expect, it } from "vitest";
import { DESTINATIONS } from "./navigation";

describe("DESTINATIONS", () => {
  it("lists Home, then Settings", () => {
    expect(DESTINATIONS.map((d) => [d.id, d.to, d.label])).toEqual([
      ["home", "/", "Home"],
      ["settings", "/settings", "Settings"],
    ]);
  });

  it("matches Home on its own path only, so it isn't highlighted on a Settings page", () => {
    expect(DESTINATIONS.find((d) => d.id === "home")?.end).toBe(true);
  });

  it("matches Settings on every page under it", () => {
    expect(DESTINATIONS.find((d) => d.id === "settings")?.end).toBeFalsy();
  });
});
