import { describe, expect, it } from "vitest";
import { settingsGroups } from "./sections";

const names = (permissions: string[]) =>
  settingsGroups(permissions).map((group) => [group.label, group.items.map((item) => item.to)]);

describe("settingsGroups", () => {
  it("gives every signed-in User the Account pages and nothing else", () => {
    expect(names([])).toEqual([
      [
        "Account",
        ["/settings/profile", "/settings/password", "/settings/security", "/settings/appearance"],
      ],
    ]);
  });

  it("adds Roles & access for holders of access:role:manage", () => {
    expect(names(["access:role:manage"])).toEqual([
      [
        "Account",
        ["/settings/profile", "/settings/password", "/settings/security", "/settings/appearance"],
      ],
      ["Workspace", ["/settings/roles"]],
    ]);
  });

  it("adds the Audit log for holders of access:audit:view", () => {
    expect(names(["access:audit:view"])[1]).toEqual(["Workspace", ["/settings/audit"]]);
  });

  it("lists Roles & access before the Audit log for a Platform admin", () => {
    expect(names(["access:audit:view", "access:role:manage", "access:role:assign"])[1]).toEqual([
      "Workspace",
      ["/settings/roles", "/settings/audit"],
    ]);
  });

  it("ignores Permissions that open no page", () => {
    expect(names(["access:role:assign"])).toHaveLength(1);
  });
});
