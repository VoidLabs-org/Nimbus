import type { CatalogPermission, Role, Scope } from "../api/client";

/** The Permissions a kind of Role can hold: platform roles any, project roles those with a Scope in a project. */
export function grantable(kind: Role["kind"], catalog: CatalogPermission[]): CatalogPermission[] {
  return catalog.filter((permission) =>
    kind === "platform" ? true : permission.kind === "project" && permission.scopes.length > 0,
  );
}

/** The Scopes a Permission may have in this Role: project roles use its own, platform roles hold project ones as All. */
export function scopesIn(role: Pick<Role, "kind">, permission: CatalogPermission): Scope[] {
  if (role.kind === "project") return permission.scopes;
  return permission.kind === "project" ? ["all"] : [];
}

/** How many Permissions differ between the saved Grants and the draft: added, removed or given another Scope. */
export function changeCount(
  saved: ReadonlyMap<string, Scope | null>,
  draft: ReadonlyMap<string, Scope | null>,
): number {
  let changes = 0;
  for (const [permission, scope] of draft) {
    if (!saved.has(permission) || saved.get(permission) !== scope) changes++;
  }
  for (const permission of saved.keys()) if (!draft.has(permission)) changes++;
  return changes;
}

/** The stored Grants as one string, to tell when they changed (saved or reset) as opposed to the Role's name. */
export function grantsSignature(role: Pick<Role, "grants">): string {
  return role.grants
    .map((grant) => `${grant.permission}=${grant.scope ?? ""}`)
    .sort()
    .join(",");
}
