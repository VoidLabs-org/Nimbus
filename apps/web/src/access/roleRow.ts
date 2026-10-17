import type { RoleSummary } from "../api/client";

/**
 * Who holds a Role, as the Roles list says it: people for a platform role, assignments for a project role (one
 * User can hold it in several projects), "Everyone" for the Role every signed-in User holds.
 */
export function heldBy(role: RoleSummary): string {
  if (role.holders === null) return "Everyone";
  if (role.holders === 0) return "No one yet";
  const [one, many] =
    role.kind === "platform" ? ["person", "people"] : ["assignment", "assignments"];
  return `${role.holders} ${role.holders === 1 ? one : many}`;
}

/**
 * The Role's tag in the list: "Customised" for a built-in Role someone changed, "Custom" for one someone created,
 * nothing for a built-in Role as it ships.
 */
export function roleTag(role: RoleSummary): string | null {
  if (!role.builtIn) return "Custom";
  return role.customised ? "Customised" : null;
}

/** How many Permissions a Role grants, e.g. "4 Permissions". */
export function permissionCount(role: RoleSummary): string {
  return `${role.permissions} ${role.permissions === 1 ? "Permission" : "Permissions"}`;
}
