import { useEffect, useEffectEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { isModifierShortcut, type NimbusDesktop } from "./desktop";
import {
  closeTab,
  cycleTab,
  isTabPath,
  nameTab,
  openTab,
  readTabs,
  writeTabs,
  type Tabs,
} from "./tabs";

/**
 * A User's Tabs as DesktopShell holds them: whose they are, the address being left (a closed Tab's page, or Home on
 * start), which gets no Tab while the window is still on it, and where start goes back to.
 */
type Held = { userId: string; tabs: Tabs; leaving: string | null; restoreTo: string | null };

/**
 * The Tabs, for the signed-in User. Kept on this computer per User and read when the shell starts for them: the window
 * starts on Home, so that start goes back to the Tab they were on instead (a Settings address opened at start keeps
 * Home behind the overlay). Every page the User opens that may have a Tab (`isTabPath`) gets one, or selects its own;
 * the query string doesn't count. Switching Tabs is opening the page: nothing is kept alive in the background.
 */
export function useTabs(userId: string, settingsOpen: boolean) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const restore = (): Held => {
    const tabs = readTabs(userId);
    const back =
      pathname === "/" && !settingsOpen && tabs.selected !== null && tabs.selected !== "/";
    return back
      ? { userId, tabs, leaving: "/", restoreTo: tabs.selected }
      : { userId, tabs, leaving: null, restoreTo: null };
  };
  const [held, setHeld] = useState(restore);
  const { tabs, leaving, restoreTo } = held;
  const set = (next: Tabs) => setHeld((current) => ({ ...current, tabs: next }));

  // Once per address (state set while rendering, so the page's breadcrumb names a Tab that is already there).
  if (held.userId !== userId) {
    // Another User: their own Tabs, never the last User's.
    setHeld(restore());
  } else if (leaving !== null) {
    if (pathname !== leaving) setHeld({ ...held, leaving: null, restoreTo: null });
  } else if (isTabPath(pathname)) {
    if (tabs.selected !== pathname) set(openTab(tabs, pathname));
  } else if (tabs.selected !== null) {
    set({ ...tabs, selected: null });
  }
  useEffect(() => {
    if (restoreTo !== null) navigate(restoreTo, { replace: true });
  }, [restoreTo, navigate]);
  useEffect(() => writeTabs(userId, tabs), [userId, tabs]);

  const close = (path: string) => {
    const { state, go } = closeTab(tabs, path);
    // Until the next page opens, the closed one is still showing; it mustn't get its Tab back. Closing Home, the
    // only Tab, while on it gives Home a new Tab at once.
    const left = go !== null && go !== pathname ? pathname : null;
    setHeld((current) => ({ ...current, tabs: state, leaving: left }));
    if (go !== null) navigate(go);
  };
  const cycle = (step: 1 | -1) => {
    const path = cycleTab(tabs, step);
    if (path !== null && path !== tabs.selected) navigate(path);
  };
  const name = (path: string, title: string) =>
    setHeld((current) => ({ ...current, tabs: nameTab(current.tabs, path, title) }));
  return { tabs, close, cycle, name };
}

/**
 * Ctrl or ⌘ W closes the selected Tab; Ctrl Tab and Ctrl Shift Tab (Ctrl on macOS too, as in browsers) move to the
 * next and the previous one, round the ends. While Settings is open over a Tab's page they do nothing.
 */
export function useTabShortcuts(
  platform: NimbusDesktop["platform"],
  settingsOpen: boolean,
  { tabs, close, cycle }: Pick<ReturnType<typeof useTabs>, "tabs" | "close" | "cycle">,
) {
  const onClose = useEffectEvent(() => {
    if (!settingsOpen && tabs.selected !== null) close(tabs.selected);
  });
  const onCycle = useEffectEvent((step: 1 | -1) => {
    if (!settingsOpen) cycle(step);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isModifierShortcut(event, platform, "w", "KeyW")) {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab" && event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        onCycle(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform]);
}
