import type { Kind } from "../api/client";

/**
 * One step of a breadcrumb path. The last (current) crumb has no `to`. A `pending` crumb is one whose text is still
 * being loaded: it shows as a placeholder.
 */
export type Crumb = { label: string; to?: string; pending?: boolean };

/** `Settings › <page>`: the path of a page the Settings overview opens. */
export function settingsCrumbs(page: string): Crumb[] {
  return [{ label: "Settings", to: "/settings" }, { label: page }];
}

/**
 * A Role's path: Settings › Roles & access › Project roles (or Platform roles) › the Role. The tab crumb links to the
 * list on that tab, so coming back from a platform Role lands on the Platform roles tab. While the Role loads, the
 * tab and the Role are pending placeholders; if it couldn't be loaded the path ends at Roles & access.
 */
export function roleCrumbs(role: { kind: Kind; name: string } | null, loading = false): Crumb[] {
  const settings: Crumb = { label: "Settings", to: "/settings" };
  if (!role && loading)
    return [
      settings,
      { label: "Roles & access", to: "/settings/roles" },
      { label: "", pending: true },
      { label: "", pending: true },
    ];
  if (!role) return [settings, { label: "Roles & access" }];
  return [
    settings,
    { label: "Roles & access", to: "/settings/roles" },
    role.kind === "platform"
      ? { label: "Platform roles", to: "/settings/roles?kind=platform" }
      : { label: "Project roles", to: "/settings/roles" },
    { label: role.name },
  ];
}

/** Paths this long fold their middle on a narrow screen. */
const COLLAPSE_FROM = 4;

/**
 * What a narrow screen shows of a long path: the first crumb and the current one, the crumbs between them tucked
 * into a menu, and an "up" step to the parent. Short paths, and any path with room, stay whole.
 */
export function collapseCrumbs(
  crumbs: Crumb[],
  narrow: boolean,
): { shown: Crumb[]; hidden: Crumb[]; up: Crumb | null } {
  if (!narrow || crumbs.length < COLLAPSE_FROM) return { shown: crumbs, hidden: [], up: null };
  return {
    shown: [crumbs[0]!, crumbs[crumbs.length - 1]!],
    hidden: crumbs.slice(1, -1),
    up: crumbs[crumbs.length - 2]!,
  };
}
