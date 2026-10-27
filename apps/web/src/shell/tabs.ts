import { matchPath } from "react-router";

/**
 * A Tab in the Desktop app's Tab row: the page open in it (its address, no query string) and the name it shows. Two
 * Tabs may show the same page, as in a browser, so each has its own id.
 */
export type Tab = { id: string; path: string; title: string };

/** The User's Tabs, in order, and the selected one's id, as kept between starts. */
export type Tabs = { tabs: Tab[]; selected: string | null };

export const NO_TABS: Tabs = { tabs: [], selected: null };

/**
 * The pages a restored Tab may show: the signed-in pages of AppRoutes but Settings, which opens in its overlay over a
 * Tab's page. A restored Tab on any other address (an old page, Not found) is dropped.
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
  if (project) return project.params.key ?? path;
  return "Not found";
}

export function newTab(path: string): Tab {
  return { id: crypto.randomUUID(), path, title: fallbackTitle(path) };
}

export function selectedTab(state: Tabs): Tab | null {
  return state.tabs.find((tab) => tab.id === state.selected) ?? null;
}

/**
 * The window opened `path` the usual way (a link, Back): the selected Tab shows it, named anew, or a new Tab does
 * when none is selected (the last one was closed).
 */
export function showInTab(state: Tabs, path: string): Tabs {
  const current = selectedTab(state);
  if (!current) return insertTab(state, newTab(path), state.tabs.length);
  if (current.path === path) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === current.id ? { ...tab, path, title: fallbackTitle(path) } : tab,
    ),
  };
}

/** Adds `tab` at `index` (kept within the row) and selects it. */
export function insertTab(state: Tabs, tab: Tab, index: number): Tabs {
  const at = Math.max(0, Math.min(index, state.tabs.length));
  return { tabs: [...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)], selected: tab.id };
}

/** Opens `path` in a new Tab right after the selected one (or at the end), and selects it. */
export function openInNewTab(state: Tabs, path: string): Tabs {
  const index = state.tabs.findIndex((tab) => tab.id === state.selected);
  return insertTab(state, newTab(path), index < 0 ? state.tabs.length : index + 1);
}

/** A copy of Tab `id` right after it, selected. */
export function duplicateTab(state: Tabs, id: string): Tabs {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tab = state.tabs[index]!;
  return insertTab(state, { ...tab, id: crypto.randomUUID() }, index + 1);
}

/** Names the selected Tab after its page's breadcrumb, while it still shows `path`. */
export function nameTab(state: Tabs, path: string, title: string): Tabs {
  const current = selectedTab(state);
  if (!current || current.path !== path || current.title === title) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === current.id ? { ...tab, title } : tab)),
  };
}

/** A closed Tab and where it was, so it can be reopened there. */
export type ClosedTab = { tab: Tab; index: number };

/**
 * Closes the Tabs `ids`. When the selected one goes, the Tab that was after it is selected, else the nearest before it;
 * `go` is then the page to open: that Tab's, or Home when none is left (which opens a Tab of its own). Closing others
 * leaves the page as it is (`go` null). `closed` lists them in row order.
 */
export function closeTabs(
  state: Tabs,
  ids: string[],
): { state: Tabs; go: string | null; closed: ClosedTab[] } {
  const closed = state.tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => ids.includes(tab.id));
  if (closed.length === 0) return { state, go: null, closed };
  const tabs = state.tabs.filter((tab) => !ids.includes(tab.id));
  if (!ids.includes(state.selected ?? "")) return { state: { ...state, tabs }, go: null, closed };
  const at = state.tabs.findIndex((tab) => tab.id === state.selected);
  const next =
    state.tabs.slice(at + 1).find((tab) => !ids.includes(tab.id)) ??
    state.tabs
      .slice(0, at)
      .reverse()
      .find((tab) => !ids.includes(tab.id));
  return { state: { tabs, selected: next?.id ?? null }, go: next?.path ?? "/", closed };
}

/** The Tab `step` places from the selected one, round the row's ends; null with no Tab to move to. */
export function cycleTab(state: Tabs, step: 1 | -1): Tab | null {
  if (state.tabs.length === 0) return null;
  const index = state.tabs.findIndex((tab) => tab.id === state.selected);
  const from = index < 0 ? (step === 1 ? -1 : 0) : index;
  const length = state.tabs.length;
  return state.tabs[(from + step + length) % length]!;
}

/** Where a User's Tabs are kept on this computer: one key per User, so another never sees them. */
export function tabsKey(userId: string): string {
  return `nimbus-tabs:${userId}`;
}

/**
 * The stored Tabs, or none when there are none or they can't be read. A Tab whose address is no longer a page, or
 * whose id appears twice, is dropped, and so is a selection that isn't one of the Tabs.
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
    const { id, path, title } = tab as { id?: unknown; path?: unknown; title?: unknown };
    if (typeof id !== "string" || !id || kept.some((other) => other.id === id)) continue;
    if (typeof path !== "string" || !isTabPath(path)) continue;
    kept.push({
      id,
      path,
      title: typeof title === "string" && title ? title : fallbackTitle(path),
    });
  }
  return {
    tabs: kept,
    selected: kept.some((tab) => tab.id === selected) ? (selected as string) : null,
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
