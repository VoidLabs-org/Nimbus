import { describe, expect, it } from "vitest";
import type { RoleSummary } from "../api/client";
import { heldBy, permissionCount, roleTag } from "./roleRow";

function role(overrides: Partial<RoleSummary>): RoleSummary {
  return {
    key: "developer",
    name: "Developer",
    description: "Builds and ships work in a project.",
    kind: "project",
    builtIn: true,
    customised: false,
    permissions: 4,
    holders: 0,
    ...overrides,
  };
}

describe("heldBy", () => {
  it("counts the people holding a platform role", () => {
    expect(heldBy(role({ kind: "platform", holders: 3 }))).toBe("3 people");
  });

  it("counts the assignments of a project role", () => {
    expect(heldBy(role({ kind: "project", holders: 12 }))).toBe("12 assignments");
  });

  it("says Everyone for the Role every signed-in User holds", () => {
    expect(heldBy(role({ kind: "platform", key: "member", holders: null }))).toBe("Everyone");
  });

  it("reads in the singular for one holder", () => {
    expect(heldBy(role({ kind: "platform", holders: 1 }))).toBe("1 person");
    expect(heldBy(role({ kind: "project", holders: 1 }))).toBe("1 assignment");
  });

  it("says No one yet when nobody holds it", () => {
    expect(heldBy(role({ kind: "platform", holders: 0 }))).toBe("No one yet");
    expect(heldBy(role({ kind: "project", holders: 0 }))).toBe("No one yet");
  });
});

describe("roleTag", () => {
  it("tags a built-in Role that was changed as Customised", () => {
    expect(roleTag(role({ builtIn: true, customised: true }))).toBe("Customised");
  });

  it("tags a Role someone created as Custom", () => {
    expect(roleTag(role({ key: "qa_lead", builtIn: false, customised: false }))).toBe("Custom");
  });

  it("has no tag for a built-in Role as it ships", () => {
    expect(roleTag(role({ builtIn: true, customised: false }))).toBeNull();
  });
});

describe("permissionCount", () => {
  it("counts the Permissions a Role grants", () => {
    expect(permissionCount(role({ permissions: 4 }))).toBe("4 Permissions");
    expect(permissionCount(role({ permissions: 1 }))).toBe("1 Permission");
    expect(permissionCount(role({ permissions: 0 }))).toBe("0 Permissions");
  });
});
