import { describe, expect, it } from "vitest";
import { destinationsFor } from "./navigation";

describe("destinationsFor", () => {
  it("gives every signed-in User Home, matched exactly so it isn't highlighted on other pages", () => {
    expect(destinationsFor([])).toEqual([{ to: "/", label: "Home", end: true }]);
  });

  it("adds Roles & access only for holders of access:role:manage", () => {
    expect(destinationsFor(["access:role:manage"]).map((d) => d.label)).toEqual([
      "Home",
      "Roles & access",
    ]);
    expect(destinationsFor(["access:role:assign"]).map((d) => d.label)).toEqual(["Home"]);
  });

  it("adds the Audit log only for holders of access:audit:view", () => {
    expect(destinationsFor(["access:audit:view"]).map((d) => d.to)).toEqual([
      "/",
      "/settings/audit",
    ]);
  });

  it("lists Home, Roles & access and the Audit log in that order for a Platform admin", () => {
    expect(
      destinationsFor(["access:audit:view", "access:role:manage", "access:role:assign"]).map(
        (d) => d.to,
      ),
    ).toEqual(["/", "/settings/roles", "/settings/audit"]);
  });
});
