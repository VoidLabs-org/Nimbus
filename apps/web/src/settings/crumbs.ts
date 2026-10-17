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
 * tab and the Role are pending placeholders. If it couldn't be loaded, the path is Settings › Roles & access › the
 * key from the address, so the way back to the list stays a link.
 */
export function roleCrumbs(
  role: { kind: Kind; name: string } | null,
  loading: boolean,
  key: string,
): Crumb[] {
  if (role)
    return [
      SETTINGS,
      ROLES,
      role.kind === "platform"
        ? { label: "Platform roles", to: "/settings/roles?kind=platform" }
        : { label: "Project roles", to: ROLES.to },
      { label: role.name },
    ];
  if (loading) return [SETTINGS, ROLES, { label: "", pending: true }, { label: "", pending: true }];
  return [SETTINGS, ROLES, { label: key }];
}
