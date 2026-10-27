import { matchPath } from "react-router";

/** A page open in the Desktop app's Tab row: its address (no query string) and the name it shows. */
export type Tab = { path: string; title: string };

/** The User's Tabs, in order, and the one selected (the page they are on), as kept between starts. */
export type Tabs = { tabs: Tab[]; selected: string | null };

export const NO_TABS: Tabs = { tabs: [], selected: null };

/**
 * The pages that get a Tab: the signed-in pages of AppRoutes but Settings, which opens in its overlay over a Tab's page.
 * An address that is none of these (Not found) gets none, and a restored Tab no longer one of them is dropped.
 */
const TAB_PAGES = ["/", "/projects", "/projects/:key"];

export function isTabPath(path: string): boolean {
  return TAB_PAGES.some((pattern) => matchPath(pattern, path) !== null);
}

/** What a Tab shows until its page names it from its breadcrumb: a project's key, the others' Sidebar names. */
export function fallbackTitle(path: string): string {
  if (path === "/") return "Home";
  if (path === "/projects") return "Projects";
  const project = matchPath("/projects/:key", path);
  return project?.params.key ?? path;
}

/** Opens `path`: selects its Tab, or adds one at the end. */
export function openTab(state: Tabs, path: string): Tabs {
  const tabs = state.tabs.some((tab) => tab.path === path)
    ? state.tabs
    : [...state.tabs, { path, title: fallbackTitle(path) }];
  return { tabs, selected: path };
}

/** Names `path`'s Tab, when it has one. */
export function nameTab(state: Tabs, path: string, title: string): Tabs {
  if (!state.tabs.some((tab) => tab.path === path && tab.title !== title)) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, title } : tab)),
  };
}

/**
 * Closes `path`'s Tab. Closing the selected one says where to go: the Tab after it, else the one before, else Home
 * (which then opens a Tab of its own). Closing another leaves the page as it is (`go` null).
 */
export function closeTab(state: Tabs, path: string): { state: Tabs; go: string | null } {
  const index = state.tabs.findIndex((tab) => tab.path === path);
  if (index < 0) return { state, go: null };
  const tabs = state.tabs.filter((tab) => tab.path !== path);
  if (state.selected !== path) return { state: { ...state, tabs }, go: null };
  const next = tabs[index] ?? tabs[index - 1];
  return { state: { tabs, selected: next?.path ?? null }, go: next?.path ?? "/" };
}

/** The Tab `step` places from the selected one, round the row's ends; null with no Tab to move to. */
export function cycleTab(state: Tabs, step: 1 | -1): string | null {
  if (state.tabs.length === 0) return null;
  const index = state.tabs.findIndex((tab) => tab.path === state.selected);
  const from = index < 0 ? (step === 1 ? -1 : 0) : index;
  const length = state.tabs.length;
  return state.tabs[(from + step + length) % length]!.path;
}

/** Where a User's Tabs are kept on this computer: one key per User, so another never sees them. */
export function tabsKey(userId: string): string {
  return `nimbus-tabs:${userId}`;
}

/**
 * The stored Tabs, or none when there are none or they can't be read. A Tab whose address is no longer a page, or
 * appears twice, is dropped, and so is a selection that isn't one of the Tabs.
 */
export function parseTabs(raw: string | null): Tabs {
  if (raw === null) return NO_TABS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return NO_TABS;
  }
  if (typeof value !== "object" || value === null) return NO_TABS;
  const { tabs, selected } = value as { tabs?: unknown; selected?: unknown };
  if (!Array.isArray(tabs)) return NO_TABS;
  const kept: Tab[] = [];
  for (const tab of tabs as unknown[]) {
    if (typeof tab !== "object" || tab === null) continue;
    const { path, title } = tab as { path?: unknown; title?: unknown };
    if (typeof path !== "string" || !isTabPath(path)) continue;
    if (kept.some((other) => other.path === path)) continue;
    kept.push({ path, title: typeof title === "string" && title ? title : fallbackTitle(path) });
  }
  return {
    tabs: kept,
    selected: kept.some((tab) => tab.path === selected) ? (selected as string) : null,
  };
}

export function readTabs(userId: string): Tabs {
  try {
    return parseTabs(localStorage.getItem(tabsKey(userId)));
  } catch {
    return NO_TABS;
  }
}

/** Keeps the Tabs; with blocked storage they last until the window closes. */
export function writeTabs(userId: string, state: Tabs) {
  try {
    localStorage.setItem(tabsKey(userId), JSON.stringify(state));
  } catch {
    // Blocked storage: the Tabs last until the window closes.
  }
}
