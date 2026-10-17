import type { AuditEntry } from "../api/client";

type Grants = Record<string, string | null>;

function grantsOf(state: Record<string, unknown> | null): Grants {
  const grants = state?.grants;
  return grants && typeof grants === "object" ? (grants as Grants) : {};
}

function withScope(permission: string, scope: string | null): string {
  return scope ? `${permission} (${scope})` : permission;
}

export type GrantDiff = {
  added: { permission: string; scope: string | null }[];
  removed: { permission: string; scope: string | null }[];
  rescoped: { permission: string; from: string | null; to: string | null }[];
};

/** Which Grants an entry added, removed or gave another Scope. */
export function diffGrants(entry: Pick<AuditEntry, "before" | "after">): GrantDiff {
  const before = grantsOf(entry.before);
  const after = grantsOf(entry.after);
  return {
    added: Object.keys(after)
      .filter((key) => !(key in before))
      .map((permission) => ({ permission, scope: after[permission] ?? null })),
    removed: Object.keys(before)
      .filter((key) => !(key in after))
      .map((permission) => ({ permission, scope: before[permission] ?? null })),
    rescoped: Object.keys(after)
      .filter((key) => key in before && before[key] !== after[key])
      .map((permission) => ({
        permission,
        from: before[permission] ?? null,
        to: after[permission] ?? null,
      })),
  };
}

/** What changed in the Grants, e.g. "Added a:b:c (project); removed d:e:f". Empty when nothing did. */
function grantChanges(entry: Pick<AuditEntry, "before" | "after">): string {
  const { added, removed, rescoped } = diffGrants(entry);
  const addedText = added.map(({ permission, scope }) => withScope(permission, scope));
  const removedText = removed.map(({ permission }) => permission);
  const rescopedText = rescoped.map(
    ({ permission, from, to }) => `${permission} from ${from ?? "none"} to ${to ?? "none"}`,
  );
  return [
    addedText.length ? `Added ${addedText.join(", ")}` : "",
    removedText.length ? `removed ${removedText.join(", ")}` : "",
    rescopedText.length ? `changed ${rescopedText.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** The User an assignment entry is about: the email they had then, or their id. */
export function userOf(state: Record<string, unknown> | null): string {
  const user = state?.user as { id?: string; email?: string } | undefined;
  return user?.email ?? user?.id ?? "a User";
}

/** One line saying what an audit entry recorded, for the Audit log page. */
export function describeAuditEntry(entry: AuditEntry): string {
  const { before, after } = entry;
  switch (entry.action) {
    case "role.created":
      return `Created the ${String(after?.kind)} role "${String(after?.name)}"`;
    case "role.described":
      return "Changed the description";
    case "role.renamed": {
      const parts = [];
      if (before?.name !== after?.name)
        parts.push(`Renamed "${String(before?.name)}" to "${String(after?.name)}"`);
      if (before?.description !== after?.description) parts.push("changed the description");
      return parts.join("; ") || "Saved the name and description unchanged";
    }
    case "role.grants_changed":
      return grantChanges(entry) || "Saved the Permissions unchanged";
    case "role.reset": {
      const changes = grantChanges(entry);
      return `Reset to defaults${changes ? `: ${changes}` : ""}`;
    }
    case "role.defaults_applied": {
      const changes = grantChanges(entry);
      return `Brought back to its defaults at startup${changes ? `: ${changes}` : ""}`;
    }
    case "role.locked_grants_restored": {
      const changes = grantChanges(entry);
      return `Gave back Permissions it must always hold${changes ? `: ${changes}` : ""}`;
    }
    case "role.deleted":
      return `Deleted "${String(before?.name)}"`;
    case "role.assigned":
      return `Gave it to ${userOf(after)}`;
    case "role.unassigned":
      return `Took it from ${userOf(before)}`;
    case "catalog.unknown_grant":
      return `Has a Grant for ${String(after?.permission)}, which is no longer a Permission (ignored)`;
    case "catalog.unknown_grant_resolved":
      return `No longer has the Grant for ${String(after?.permission)}, which is no longer a Permission`;
    default:
      return entry.action;
  }
}
