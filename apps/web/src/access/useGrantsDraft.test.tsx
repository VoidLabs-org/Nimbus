// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Role } from "../api/client";
import { useGrantsDraft } from "./useGrantsDraft";

function role(grants: string[]): Role {
  return {
    key: "alpha",
    name: "Alpha",
    description: "",
    kind: "project",
    builtIn: false,
    customised: false,
    holders: 0,
    version: 1,
    locked: false,
    newPermissions: [],
    grants: grants.map((permission) => ({ permission, scope: "project", locked: false })),
  };
}

describe("a Role's unsaved Grants", () => {
  it("follow the stored Grants when nothing was ticked", () => {
    const { result, rerender } = renderHook(({ stored }) => useGrantsDraft(stored, () => {}), {
      initialProps: { stored: role(["a:read"]) },
    });

    rerender({ stored: role(["a:read", "a:write"]) });

    expect([...result.current.draft.keys()].sort()).toEqual(["a:read", "a:write"]);
  });

  it("survive a refresh that shows someone else's change", () => {
    const { result, rerender } = renderHook(({ stored }) => useGrantsDraft(stored, () => {}), {
      initialProps: { stored: role(["a:read"]) },
    });
    act(() => result.current.changeScope("b:read", "project"));

    rerender({ stored: role(["a:read", "a:write"]) });

    expect([...result.current.draft.keys()].sort()).toEqual(["a:read", "b:read"]);
  });
});
