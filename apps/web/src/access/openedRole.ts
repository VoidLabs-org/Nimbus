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

/** The OpenedRole in a page's navigation state, or nothing when the state isn't one (a direct visit, other state). */
export function readOpenedRole(state: unknown): OpenedRole | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const { kind, builtIn, described } = state as Partial<OpenedRole>;
  if ((kind !== "platform" && kind !== "project") || typeof builtIn !== "boolean") return undefined;
  if (typeof described !== "boolean") return undefined;
  return { kind, builtIn, described };
}

/**
 * Whether a Role has a People tab for this User: everyone is held by every signed-in User, and project roles are
 * given on a project's Members page.
 */
export function showsPeopleTab(kind: Kind, key: string, platformPermissions: string[]): boolean {
  return (
    kind === "platform" && key !== "everyone" && platformPermissions.includes("access:role:assign")
  );
}
