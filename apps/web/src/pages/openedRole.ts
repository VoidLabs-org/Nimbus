import type { Kind } from "../api/client";

/** What the Roles list (or the new Role window) already knows about a Role it opens, so the skeleton can match it. */
export type OpenedRole = { kind: Kind; builtIn: boolean; described: boolean };

export function openedRole(role: {
  kind: Kind;
  builtIn: boolean;
  description: string | null;
}): OpenedRole {
  return { kind: role.kind, builtIn: role.builtIn, described: Boolean(role.description) };
}
