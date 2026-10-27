import { useSyncExternalStore } from "react";
import type { NimbusDesktop } from "./desktop";

/** Whether the Desktop app's Sidebar shows names (open) or only a rail of icons (folded). */
export type SidebarState = "open" | "folded";

/** The storage key for the choice; the Desktop app keeps it on this computer. */
export const SIDEBAR_KEY = "nimbus-sidebar";

/** The media query below which the Sidebar folds itself, whatever was chosen: under 960px wide. */
export const AUTO_FOLD_QUERY = "(max-width: 959.98px)";

export function parseSidebarState(raw: string | null): SidebarState {
  return raw === "folded" ? "folded" : "open";
}

export function readSidebarState(): SidebarState {
  try {
    return parseSidebarState(localStorage.getItem(SIDEBAR_KEY));
  } catch {
    // Unreadable or blocked storage: the default.
    return "open";
  }
}

function writeSidebarState(state: SidebarState) {
  try {
    localStorage.setItem(SIDEBAR_KEY, state);
  } catch {
    // Blocked storage: the choice lasts until the app closes.
  }
}

// What components subscribed to, so a choice made on the Appearance page folds the Sidebar at once (see navPosition).
const listeners = new Set<() => void>();
let current: SidebarState | null = null;

function snapshot(): SidebarState {
  return (current ??= readSidebarState());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forgets the choice held in memory, so the next read comes from storage. For tests. */
export function resetSidebarState() {
  current = null;
}

/** The chosen Sidebar state and a way to change it; kept on this computer, and read on the first render. */
export function useSidebarState(): [SidebarState, (state: SidebarState) => void] {
  const state = useSyncExternalStore(subscribe, snapshot, () => "open" as const);
  return [
    state,
    (next) => {
      current = next;
      writeSidebarState(next);
      listeners.forEach((listener) => listener());
    },
  ];
}

/**
 * Whether a key press is the fold shortcut: ⌘ \ on macOS, Ctrl \ elsewhere, with no other modifier. Matched on the key
 * (`\`) or, for keyboards where that key types something else, on its position (Backslash).
 */
export function isFoldShortcut(
  event: {
    key: string;
    code: string;
    altKey: boolean;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  },
  platform: NimbusDesktop["platform"],
): boolean {
  const mac = platform === "darwin";
  if (event.altKey || event.shiftKey) return false;
  if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return false;
  return event.key === "\\" || event.code === "Backslash";
}
