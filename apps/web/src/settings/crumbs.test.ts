import { describe, expect, it } from "vitest";
import { roleCrumbs, settingsCrumbs } from "./crumbs";

describe("settingsCrumbs", () => {
  it("is Settings, linked, then the page as the current crumb", () => {
    expect(settingsCrumbs("Profile")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Profile" },
    ]);
  });
});

describe("roleCrumbs", () => {
  it("goes Settings, Roles & access, the kind's tab, then the Role", () => {
    expect(roleCrumbs({ kind: "project", name: "Admin" }, false, "admin")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Roles & access", to: "/settings/roles" },
      { label: "Project roles", to: "/settings/roles" },
      { label: "Admin" },
    ]);
  });

  it("links a platform Role's tab crumb to the Platform roles tab", () => {
    expect(roleCrumbs({ kind: "platform", name: "Auditor" }, false, "auditor")[2]).toEqual({
      label: "Platform roles",
      to: "/settings/roles?kind=platform",
    });
  });

  it("holds the places of the tab and the Role as pending crumbs while the Role loads", () => {
    expect(roleCrumbs(null, true, "admin")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Roles & access", to: "/settings/roles" },
      { label: "", pending: true },
      { label: "", pending: true },
    ]);
  });

  it("keeps Roles & access a link and ends at the key when the Role couldn't be loaded", () => {
    expect(roleCrumbs(null, false, "does-not-exist")).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Roles & access", to: "/settings/roles" },
      { label: "does-not-exist" },
    ]);
  });
});
