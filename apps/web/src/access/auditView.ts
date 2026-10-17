import type { AuditEntry } from "../api/client";
import { diffGrants, userOf } from "./auditText";

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A day's heading in the Audit log: Today, Yesterday, then the date (with the year when it isn't this one). */
export function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** Entries (newest first) in runs of the same day, each run with its heading. */
export function groupByDay(
  entries: AuditEntry[],
  now: Date,
): { key: number; label: string; entries: AuditEntry[] }[] {
  const groups: { key: number; label: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const at = new Date(entry.at);
    const key = startOfDay(at);
    const last = groups.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(at, now), entries: [entry] });
  }
  return groups;
}

const MAX_CHIPS = 3;

/** Up to three Grants an entry added or removed, and how many more there were. */
export function grantChips(entry: AuditEntry): {
  chips: { kind: "added" | "removed"; permission: string; scope: string | null }[];
  more: number;
} {
  const { added, removed } = diffGrants(entry);
  const all = [
    ...added.map(({ permission, scope }) => ({ kind: "added" as const, permission, scope })),
    ...removed.map(({ permission, scope }) => ({ kind: "removed" as const, permission, scope })),
  ];
  return { chips: all.slice(0, MAX_CHIPS), more: Math.max(0, all.length - MAX_CHIPS) };
}

export type AuditChange = { label: string; before: string | null; after: string | null };

const FIELDS = [
  ["name", "Name"],
  ["description", "Description"],
  ["kind", "Kind"],
] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** What an entry changed, as before → after rows: Grants added, removed or re-scoped, other fields, and the User. */
export function auditChanges(entry: AuditEntry): AuditChange[] {
  const { added, removed, rescoped } = diffGrants(entry);
  const changes: AuditChange[] = [
    ...added.map(({ permission, scope }) => ({
      label: permission,
      before: null,
      after: scope ?? "granted",
    })),
    ...removed.map(({ permission, scope }) => ({
      label: permission,
      before: scope ?? "granted",
      after: null,
    })),
    ...rescoped.map(({ permission, from, to }) => ({
      label: permission,
      before: from ?? "none",
      after: to ?? "none",
    })),
  ];
  for (const [field, label] of FIELDS) {
    const before = text(entry.before?.[field]);
    const after = text(entry.after?.[field]);
    if (before !== after) changes.push({ label, before, after });
  }
  if (entry.action === "role.assigned")
    changes.push({ label: "User", before: null, after: userOf(entry.after) });
  if (entry.action === "role.unassigned")
    changes.push({ label: "User", before: userOf(entry.before), after: null });
  return changes;
}

const TITLES: Record<string, string> = {
  "role.created": "Created a Role",
  "role.described": "Changed the description",
  "role.renamed": "Renamed a Role",
  "role.grants_changed": "Changed Permissions",
  "role.reset": "Reset to defaults",
  "role.defaults_applied": "Defaults applied at startup",
  "role.locked_grants_restored": "Gave back locked Permissions",
  "role.deleted": "Deleted a Role",
  "role.assigned": "Gave a Role",
  "role.unassigned": "Took a Role away",
  "catalog.unknown_grant": "Found an unknown Grant",
  "catalog.unknown_grant_resolved": "Cleared an unknown Grant",
};

/** A few words naming what an entry did, for the top of its dialog. */
export function auditTitle(entry: AuditEntry): string {
  return TITLES[entry.action] ?? entry.action;
}

/** The changes as the lines of a diff: what was there (removed) and what is there now (added). */
export function diffLines(changes: AuditChange[]): { kind: "added" | "removed"; text: string }[] {
  const line = (label: string, value: string) =>
    value === "granted" ? label : `${label} = ${value}`;
  return changes.flatMap(({ label, before, after }) => [
    ...(before !== null ? [{ kind: "removed" as const, text: line(label, before) }] : []),
    ...(after !== null ? [{ kind: "added" as const, text: line(label, after) }] : []),
  ]);
}

/** A name's initials for an avatar: the first and last word's first letters. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!;
  const last = words.length > 1 ? words[words.length - 1]! : "";
  return (first[0]! + (last[0] ?? "")).toUpperCase();
}

/** The name an entry shows for who did it. */
export function actorName(entry: Pick<AuditEntry, "actor">): string {
  return entry.actor ? (entry.actor.displayName ?? "A deleted User") : "System";
}
