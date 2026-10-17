import { describe, expect, it } from "vitest";
import type { CatalogPermission, Role } from "../api/client";
import { changeCount, grantable, scopesIn } from "./grants";

function permission(overrides: Partial<CatalogPermission>): CatalogPermission {
  return {
    key: "projects:project:view",
    heading: "Projects",
    description: "See a project.",
    kind: "project",
    scopes: ["own", "project"],
    ownHint: null,
    reserved: false,
    ...overrides,
  };
}

const catalog = [
  permission({ key: "a" }),
  permission({ key: "b", scopes: [] }),
  permission({ key: "c", kind: "platform", scopes: [] }),
];

describe("grantable", () => {
  it("lists every Permission for a platform role", () => {
    expect(grantable("platform", catalog).map((p) => p.key)).toEqual(["a", "b", "c"]);
  });

  it("lists only project Permissions that have a Scope for a project role", () => {
    expect(grantable("project", catalog).map((p) => p.key)).toEqual(["a"]);
  });
});

describe("scopesIn", () => {
  const role = (kind: Role["kind"]) => ({ kind }) as Role;

  it("uses the Permission's own Scopes in a project role", () => {
    expect(scopesIn(role("project"), catalog[0]!)).toEqual(["own", "project"]);
  });

  it("holds a project Permission as All in a platform role", () => {
    expect(scopesIn(role("platform"), catalog[0]!)).toEqual(["all"]);
  });

  it("gives a platform Permission no Scope in a platform role", () => {
    expect(scopesIn(role("platform"), catalog[2]!)).toEqual([]);
  });
});

describe("changeCount", () => {
  const saved = new Map<string, "own" | "project" | "all" | null>([
    ["a", "project"],
    ["b", "own"],
  ]);

  it("is zero for an untouched draft", () => {
    expect(changeCount(saved, new Map(saved))).toBe(0);
  });

  it("counts added, removed and re-scoped Permissions once each", () => {
    const draft = new Map(saved);
    draft.delete("a");
    draft.set("b", "project");
    draft.set("c", "all");
    expect(changeCount(saved, draft)).toBe(3);
  });

  it("is zero again when a change is undone", () => {
    const draft = new Map(saved);
    draft.set("b", "project");
    draft.set("b", "own");
    expect(changeCount(saved, draft)).toBe(0);
  });
});
