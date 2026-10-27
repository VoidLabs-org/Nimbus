/**
 * One step of a breadcrumb path. The last (current) crumb has no `to`. A `pending` crumb is one whose text is still
 * being loaded: it shows as a placeholder.
 */
export type Crumb = { label: string; to?: string; pending?: boolean };

/** Paths this long fold their middle on a narrow screen. */
const COLLAPSE_FROM = 4;

/**
 * What a narrow screen shows of a long path: the first crumb and the current one, the crumbs between them tucked
 * into a menu, and an "up" step to the nearest linked crumb above the current one (the parent, once it is known).
 * Short paths, and any path with room, stay whole. A path still loading folds the same way as the loaded one, so it
 * doesn't jump when it fills in.
 */
export function collapseCrumbs(
  crumbs: Crumb[],
  narrow: boolean,
): { shown: Crumb[]; hidden: Crumb[]; up: Crumb | null } {
  if (!narrow || crumbs.length < COLLAPSE_FROM) return { shown: crumbs, hidden: [], up: null };
  return {
    shown: [crumbs[0]!, crumbs[crumbs.length - 1]!],
    hidden: crumbs.slice(1, -1),
    up:
      crumbs
        .slice(0, -1)
        .reverse()
        .find((crumb) => crumb.to) ?? null,
  };
}

/** What the Desktop app's Tab for a page is called: its breadcrumb's last crumb, or null while that is still loading. */
export function tabTitle(crumbs: Crumb[]): string | null {
  const current = crumbs.at(-1);
  return current && !current.pending && current.label ? current.label : null;
}
