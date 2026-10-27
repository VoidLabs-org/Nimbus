import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { isSettingsPath } from "../settings/settingsOverlay";
import { isModifierShortcut, type NimbusDesktop } from "./desktop";
import {
  closeTabs,
  cycleTab,
  duplicateTab,
  insertTab,
  nameTab,
  openInNewTab,
  readTabs,
  selectedTab,
  showInTab,
  writeTabs,
  type ClosedTab,
  type Tabs,
} from "./tabs";

/**
 * A User's Tabs as DesktopShell holds them: whose they are, and, after a Tab action that opens another page, the
 * address it was taken from (its location key): until the window has moved on, the page showing is still the old one
 * and must not land in the newly selected Tab. `closed` is this run's closed Tabs, the last one first.
 */
type Held = {
  userId: string;
  tabs: Tabs;
  waitingFrom: string | null;
  restoreTo: string | null;
  closed: ClosedTab[];
};

/**
 * The Tabs, for the signed-in User. Kept on this computer per User and read when the shell starts for them: the window
 * starts on Home, so that start goes back to the Tab they were on instead (a Settings address opened at start keeps
 * Home behind the overlay). Opening a page the usual way shows it in the selected Tab, as in a browser; a new Tab
 * opens only when asked for (`openInNewTab`). The query string doesn't count. Switching Tabs is opening the page:
 * nothing is kept alive in the background.
 */
export function useTabs(userId: string, settingsOpen: boolean) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const restore = (): Held => {
    const tabs = readTabs(userId);
    const back = pathname === "/" && !settingsOpen ? selectedTab(tabs) : null;
    return back && back.path !== "/"
      ? { userId, tabs, waitingFrom: location.key, restoreTo: back.path, closed: [] }
      : { userId, tabs, waitingFrom: null, restoreTo: null, closed: [] };
  };
  const [held, setHeld] = useState(restore);
  const { tabs, waitingFrom, restoreTo } = held;
  const set = (next: Tabs) => setHeld((current) => ({ ...current, tabs: next }));

  // Once per address (state set while rendering, so the page's breadcrumb names a Tab that already shows it).
  if (held.userId !== userId) {
    // Another User: their own Tabs, never the last User's.
    setHeld(restore());
  } else if (waitingFrom !== null) {
    if (location.key !== waitingFrom) setHeld({ ...held, waitingFrom: null, restoreTo: null });
  } else {
    const next = showInTab(tabs, pathname);
    if (next !== tabs) set(next);
  }
  useEffect(() => {
    if (restoreTo !== null) navigate(restoreTo, { replace: true });
  }, [restoreTo, navigate]);
  useEffect(() => writeTabs(userId, tabs), [userId, tabs]);

  /** Makes `next` the Tabs and opens `go`, keeping the page now showing out of them until it has opened. */
  const change = (next: Tabs, go: string | null, closed: ClosedTab[] = []) => {
    setHeld((current) => ({
      ...current,
      tabs: next,
      waitingFrom: go === null ? current.waitingFrom : location.key,
      closed: [...[...closed].reverse(), ...current.closed],
    }));
    if (go !== null) navigate(go);
  };

  const select = (id: string) => {
    const tab = tabs.tabs.find((each) => each.id === id);
    if (tab && id !== tabs.selected) change({ ...tabs, selected: id }, tab.path);
  };
  const close = (ids: string[]) => {
    const { state, go, closed } = closeTabs(tabs, ids);
    change(state, go, closed);
  };
  const closeOthers = (id: string) =>
    close(tabs.tabs.filter((tab) => tab.id !== id).map((tab) => tab.id));
  const closeToTheRight = (id: string) => {
    const index = tabs.tabs.findIndex((tab) => tab.id === id);
    if (index >= 0) close(tabs.tabs.slice(index + 1).map((tab) => tab.id));
  };
  const openNew = (path: string) => change(openInNewTab(tabs, path), path);
  const duplicate = (id: string) => {
    const next = duplicateTab(tabs, id);
    change(next, selectedTab(next)?.path ?? null);
  };
  const reopen = () => {
    const [last, ...rest] = held.closed;
    if (!last) return;
    setHeld((current) => ({ ...current, closed: rest }));
    change(insertTab(tabs, last.tab, last.index), last.tab.path);
  };
  const cycle = (step: 1 | -1) => {
    const tab = cycleTab(tabs, step);
    if (tab) select(tab.id);
  };
  const name = (path: string, title: string) =>
    setHeld((current) => ({ ...current, tabs: nameTab(current.tabs, path, title) }));
  return {
    tabs,
    canReopen: held.closed.length > 0,
    select,
    close,
    closeOthers,
    closeToTheRight,
    openNew,
    duplicate,
    reopen,
    cycle,
    name,
  };
}

export type TabActions = ReturnType<typeof useTabs>;

/** Ctrl Shift T (⌘ Shift T on macOS): reopens the last closed Tab, as in browsers. */
function isReopenShortcut(event: KeyboardEvent, platform: NimbusDesktop["platform"]): boolean {
  const mac = platform === "darwin";
  if (event.altKey || !event.shiftKey) return false;
  if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return false;
  return event.key.toLowerCase() === "t" || event.code === "KeyT";
}

/**
 * Ctrl or ⌘ W closes the selected Tab, Ctrl or ⌘ Shift T reopens the last closed one; Ctrl Tab and Ctrl Shift Tab
 * (Ctrl on macOS too, as in browsers) move to the next and the previous Tab, round the ends. While Settings is open
 * over a Tab's page they do nothing.
 */
export function useTabShortcuts(
  platform: NimbusDesktop["platform"],
  settingsOpen: boolean,
  actions: TabActions,
) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (isModifierShortcut(event, platform, "w", "KeyW")) {
      event.preventDefault();
      if (!settingsOpen && actions.tabs.selected !== null) actions.close([actions.tabs.selected]);
    } else if (isReopenShortcut(event, platform)) {
      event.preventDefault();
      if (!settingsOpen) actions.reopen();
    } else if (event.key === "Tab" && event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (!settingsOpen) actions.cycle(event.shiftKey ? -1 : 1);
    }
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.defaultPrevented) onKey(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Whether a click asks for a new Tab: ⌘ click on macOS, Ctrl click elsewhere, or the middle button. */
export function isNewTabClick(event: MouseEvent, platform: NimbusDesktop["platform"]): boolean {
  if (event.button === 1) return true;
  if (event.button !== 0 || event.altKey || event.shiftKey) return false;
  return platform === "darwin" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** The Nimbus link a click landed on, or null for anything else (another site's link, no link). */
function nimbusLink(event: MouseEvent): URL | null {
  const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(target instanceof HTMLAnchorElement)) return null;
  const url = new URL(target.href);
  return url.origin === window.location.origin ? url : null;
}

/**
 * ⌘ click (macOS), Ctrl click or a middle click on a Nimbus link opens its page in a new Tab, as in a browser (the
 * window would otherwise hand it to the default browser). A Settings link opens Settings, which is never a Tab.
 * Another site's link is left to the window, which opens it in the default browser.
 */
export function useNewTabClicks(
  platform: NimbusDesktop["platform"],
  openNew: (path: string) => void,
  open: (path: string) => void,
) {
  const onClick = useEffectEvent((event: MouseEvent) => {
    if (event.defaultPrevented || !isNewTabClick(event, platform)) return;
    const url = nimbusLink(event);
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    if (isSettingsPath(url.pathname)) open(url.pathname + url.search);
    else openNew(url.pathname);
  });
  useEffect(() => {
    const onClickEvent = (event: MouseEvent) => onClick(event);
    // The middle button on a link would start autoscroll.
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 1 && nimbusLink(event)) event.preventDefault();
    };
    document.addEventListener("click", onClickEvent, true);
    document.addEventListener("auxclick", onClickEvent, true);
    document.addEventListener("mousedown", onMouseDown, true);
    return () => {
      document.removeEventListener("click", onClickEvent, true);
      document.removeEventListener("auxclick", onClickEvent, true);
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }, []);
}
