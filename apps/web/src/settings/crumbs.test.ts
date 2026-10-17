import { describe, expect, it } from "vitest";
import { collapseCrumbs, roleCrumbs, settingsCrumbs, type Crumb } from "./crumbs";

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
    expect(roleCrumbs({ kind: "project", name: "Admin" })).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Roles & access", to: "/settings/roles" },
      { label: "Project roles", to: "/settings/roles" },
      { label: "Admin" },
    ]);
  });

  it("links a platform Role's tab crumb to the Platform roles tab", () => {
    expect(roleCrumbs({ kind: "platform", name: "Auditor" })[2]).toEqual({
      label: "Platform roles",
      to: "/settings/roles?kind=platform",
    });
  });

  it("ends at Roles & access, as the current crumb, when the Role couldn't be loaded", () => {
    expect(roleCrumbs(null)).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Roles & access" },
    ]);
  });

  it("holds the places of the tab and the Role as pending crumbs while the Role loads", () => {
    expect(roleCrumbs(null, true)).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Roles & access", to: "/settings/roles" },
      { label: "", pending: true },
      { label: "", pending: true },
    ]);
  });
});

const long: Crumb[] = [
  { label: "A", to: "/a" },
  { label: "B", to: "/b" },
  { label: "C", to: "/c" },
  { label: "D" },
];

describe("collapseCrumbs", () => {
  it("shows every crumb when there is room", () => {
    expect(collapseCrumbs(long, false)).toEqual({ shown: long, hidden: [], up: null });
  });

  it("keeps short paths whole even when narrow", () => {
    const short = long.slice(0, 3);
    expect(collapseCrumbs(short, true)).toEqual({ shown: short, hidden: [], up: null });
  });

  it("when narrow, hides the middle of a path of four or more and offers the parent as up", () => {
    expect(collapseCrumbs(long, true)).toEqual({
      shown: [long[0], long[3]],
      hidden: [long[1], long[2]],
      up: long[2],
    });
  });
});
