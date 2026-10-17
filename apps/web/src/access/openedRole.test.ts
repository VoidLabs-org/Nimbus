import { describe, expect, it } from "vitest";
import { openedRole, readOpenedRole, showsPeopleTab } from "./openedRole";

describe("readOpenedRole", () => {
  it("reads what openedRole wrote", () => {
    const state = openedRole({ kind: "platform", builtIn: true, description: "Admin" });
    expect(readOpenedRole(state)).toEqual({ kind: "platform", builtIn: true, described: true });
  });

  it("ignores state that isn't one", () => {
    expect(readOpenedRole(null)).toBeUndefined();
    expect(readOpenedRole({ from: "/home" })).toBeUndefined();
    expect(readOpenedRole({ kind: "other", builtIn: true, described: true })).toBeUndefined();
  });
});

describe("showsPeopleTab", () => {
  const assign = ["access:role:assign"];

  it("is for platform roles the User may assign", () => {
    expect(showsPeopleTab("platform", "platform_admin", assign)).toBe(true);
    expect(showsPeopleTab("platform", "platform_admin", [])).toBe(false);
  });

  it("is not for project roles or Everyone", () => {
    expect(showsPeopleTab("project", "project_admin", assign)).toBe(false);
    expect(showsPeopleTab("platform", "everyone", assign)).toBe(false);
  });
});
