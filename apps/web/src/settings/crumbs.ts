import type { Kind } from "../api/client";
import type { Crumb } from "../shell/crumbs";

const SETTINGS: Crumb = { label: "Settings", to: "/settings" };
const ROLES: Crumb = { label: "Roles & access", to: "/settings/roles" };

/** `Settings › <page>`: the path of a page the Settings overview opens. */
export function settingsCrumbs(page: string): Crumb[] {
  return [SETTINGS, { label: page }];
}

/**
 * A Role's path: Settings › Roles & access › Project roles (or Platform roles) › the Role. The tab crumb links to the
 * list on that tab, so coming back from a platform Role lands on the Platform roles tab. While the Role loads, the
 * tab and the Role are pending placeholders (`null`). A Role that can't be loaded gets a status page instead.
 */
export function roleCrumbs(role: { kind: Kind; name: string } | null): Crumb[] {
  if (role)
    return [
      SETTINGS,
      ROLES,
      role.kind === "platform"
        ? { label: "Platform roles", to: "/settings/roles?kind=platform" }
        : { label: "Project roles", to: ROLES.to },
      { label: role.name },
    ];
  return [SETTINGS, ROLES, { label: "", pending: true }, { label: "", pending: true }];
}
