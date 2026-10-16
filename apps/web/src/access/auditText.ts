import type { AuditEntry } from "../api/client";

type Grants = Record<string, string | null>;

function grantsOf(state: Record<string, unknown> | null): Grants {
  const grants = state?.grants;
  return grants && typeof grants === "object" ? (grants as Grants) : {};
}

function withScope(permission: string, scope: string | null): string {
  return scope ? `${permission} (${scope})` : permission;
}

/** What changed in the Grants, e.g. "Added a:b:c (project); removed d:e:f". Empty when nothing did. */
function grantChanges(before: Grants, after: Grants): string {
  const added = Object.keys(after)
    .filter((key) => !(key in before))
    .map((key) => withScope(key, after[key]));
  const removed = Object.keys(before).filter((key) => !(key in after));
  const rescoped = Object.keys(after)
    .filter((key) => key in before && before[key] !== after[key])
    .map((key) => `${key} from ${before[key] ?? "none"} to ${after[key] ?? "none"}`);
  return [
    added.length ? `Added ${added.join(", ")}` : "",
    removed.length ? `removed ${removed.join(", ")}` : "",
    rescoped.length ? `changed ${rescoped.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
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
      return grantChanges(grantsOf(before), grantsOf(after)) || "Saved the Permissions unchanged";
    case "role.reset": {
      const changes = grantChanges(grantsOf(before), grantsOf(after));
      return `Reset to defaults${changes ? `: ${changes}` : ""}`;
    }
    case "role.defaults_applied": {
      const changes = grantChanges(grantsOf(before), grantsOf(after));
      return `Brought back to its defaults at startup${changes ? `: ${changes}` : ""}`;
    }
    case "role.locked_grants_restored": {
      const changes = grantChanges(grantsOf(before), grantsOf(after));
      return `Gave back Permissions it must always hold${changes ? `: ${changes}` : ""}`;
    }
    case "role.deleted":
      return `Deleted "${String(before?.name)}"`;
    case "catalog.unknown_grant":
      return `Has a Grant for ${String(after?.permission)}, which is no longer a Permission (ignored)`;
    case "catalog.unknown_grant_resolved":
      return `No longer has the Grant for ${String(after?.permission)}, which is no longer a Permission`;
    default:
      return entry.action;
  }
}
