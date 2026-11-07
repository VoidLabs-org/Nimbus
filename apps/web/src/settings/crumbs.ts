import type { Kind } from "../api/client";
import type { Crumb } from "../shell/crumbs";

const SETTINGS: Crumb = { label: "Settings", to: "/settings" };
const ROLES: Crumb = { label: "Roles & access", to: "/settings/roles" };

/**
 * `Settings › <page>`: a Settings page's path. Beside the Settings list (the browser's layout or the Desktop overlay)
 * it shortens to nothing (see overlayCrumbs); the full path is for the Desktop app's Tab title.
 */
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

/**
 * A Settings page's path beside the Settings list (the Desktop overlay or the browser's Settings layout), which stands
 * in for the Settings crumb: that crumb goes, and a path left with only the page itself goes too (the page's title
 * says it). A Role keeps Roles & access › its tab › the Role.
 */
export function overlayCrumbs(crumbs: Crumb[]): Crumb[] {
  const inside = crumbs.filter((crumb) => crumb.to !== SETTINGS.to);
  return inside.length > 1 ? inside : [];
}
