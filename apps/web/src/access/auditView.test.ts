import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../api/client";
import {
  auditChanges,
  auditTitle,
  dayLabel,
  diffLines,
  grantChips,
  groupByDay,
  initialsOf,
} from "./auditView";

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: "1",
    at: "2026-10-17T09:00:00",
    actor: null,
    action: "role.grants_changed",
    target: { type: "role", key: "developer", exists: true },
    before: null,
    after: null,
    ...overrides,
  };
}

const now = new Date("2026-10-17T15:00:00");

describe("dayLabel", () => {
  it("says Today and Yesterday", () => {
    expect(dayLabel(new Date("2026-10-17T00:30:00"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-10-16T23:59:00"), now)).toBe("Yesterday");
  });

  it("gives older days as a date", () => {
    const older = new Date("2026-10-10T12:00:00");
    expect(dayLabel(older, now)).toBe(
      older.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    );
  });

  it("includes the year for a day in another year", () => {
    expect(dayLabel(new Date("2025-12-31T12:00:00"), now)).toContain("2025");
  });
});

describe("groupByDay", () => {
  it("keeps the order and starts a group when the day changes", () => {
    const groups = groupByDay(
      [
        entry({ id: "a", at: "2026-10-17T10:00:00" }),
        entry({ id: "b", at: "2026-10-17T08:00:00" }),
        entry({ id: "c", at: "2026-10-16T20:00:00" }),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.entries.map((e) => e.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
    ]);
  });

  it("is empty for no entries", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

const changed = entry({
  before: { grants: { "a:b:c": "own", "d:e:f": null, "g:h:i": "project" } },
  after: { grants: { "a:b:c": "all", "g:h:i": "project", "j:k:l": "project" } },
});

describe("grantChips", () => {
  it("lists added then removed Grants", () => {
    expect(grantChips(changed)).toEqual({
      chips: [
        { kind: "added", permission: "j:k:l", scope: "project" },
        { kind: "removed", permission: "d:e:f", scope: null },
      ],
      more: 0,
    });
  });

  it("shows three and counts the rest", () => {
    const many = entry({
      before: { grants: {} },
      after: { grants: { a: null, b: null, c: null, d: null, e: null } },
    });
    const { chips, more } = grantChips(many);
    expect(chips).toHaveLength(3);
    expect(more).toBe(2);
  });

  it("has none for an entry without Grants", () => {
    expect(grantChips(entry({ action: "role.renamed" }))).toEqual({ chips: [], more: 0 });
  });
});

describe("auditChanges", () => {
  it("lists each Grant added, removed or given another Scope", () => {
    expect(auditChanges(changed)).toEqual([
      { label: "j:k:l", before: null, after: "project" },
      { label: "d:e:f", before: "granted", after: null },
      { label: "a:b:c", before: "own", after: "all" },
    ]);
  });

  it("lists changed name, description and kind", () => {
    const renamed = entry({
      action: "role.renamed",
      before: { name: "Dev", description: "", kind: "project" },
      after: { name: "Developer", description: "Builds things", kind: "project" },
    });
    expect(auditChanges(renamed)).toEqual([
      { label: "Name", before: "Dev", after: "Developer" },
      { label: "Description", before: null, after: "Builds things" },
    ]);
  });

  it("shows a created Role's fields as new", () => {
    const created = entry({
      action: "role.created",
      after: { name: "QA", description: "", kind: "platform", grants: {} },
    });
    expect(auditChanges(created)).toEqual([
      { label: "Name", before: null, after: "QA" },
      { label: "Kind", before: null, after: "platform" },
    ]);
  });

  it("names the User of an assignment", () => {
    expect(
      auditChanges(
        entry({ action: "role.assigned", after: { user: { id: "u1", email: "a@b.c" } } }),
      ),
    ).toEqual([{ label: "User", before: null, after: "a@b.c" }]);
    expect(
      auditChanges(entry({ action: "role.unassigned", before: { user: { id: "u1" } } })),
    ).toEqual([{ label: "User", before: "u1", after: null }]);
  });

  it("is empty when nothing differs", () => {
    expect(
      auditChanges(entry({ before: { grants: { a: null } }, after: { grants: { a: null } } })),
    ).toEqual([]);
  });
});

describe("auditTitle", () => {
  it("names what happened in a few words", () => {
    expect(auditTitle(entry({ action: "role.grants_changed" }))).toBe("Changed Permissions");
    expect(auditTitle(entry({ action: "role.created" }))).toBe("Created a Role");
    expect(auditTitle(entry({ action: "role.defaults_applied" }))).toBe(
      "Defaults applied at startup",
    );
  });

  it("falls back to the action", () => {
    expect(auditTitle(entry({ action: "something.new" }))).toBe("something.new");
  });
});

describe("diffLines", () => {
  it("writes each change as removed then added lines, with the Scope after =", () => {
    expect(
      diffLines([
        { label: "j:k:l", before: null, after: "project" },
        { label: "d:e:f", before: "granted", after: null },
        { label: "a:b:c", before: "own", after: "all" },
        { label: "Name", before: "Dev", after: "Developer" },
      ]),
    ).toEqual([
      { kind: "added", text: "j:k:l = project" },
      { kind: "removed", text: "d:e:f" },
      { kind: "removed", text: "a:b:c = own" },
      { kind: "added", text: "a:b:c = all" },
      { kind: "removed", text: "Name = Dev" },
      { kind: "added", text: "Name = Developer" },
    ]);
  });
});

describe("initialsOf", () => {
  it("takes the first letters of the first and last name", () => {
    expect(initialsOf("Maya Reyes")).toBe("MR");
    expect(initialsOf("maya")).toBe("M");
    expect(initialsOf("Ana Maria Lopez")).toBe("AL");
  });

  it("copes with an empty name", () => {
    expect(initialsOf("  ")).toBe("?");
  });
});
