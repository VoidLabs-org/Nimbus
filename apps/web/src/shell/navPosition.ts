import { useSyncExternalStore } from "react";

/** Which edge of the window the navbar sits on. */
export type NavPosition = "top" | "bottom" | "left" | "right";

export const NAV_POSITIONS: readonly NavPosition[] = ["top", "bottom", "left", "right"];

/** The browser storage key for the chosen edge. */
export const NAV_POSITION_KEY = "nimbus-navedge";

export function parseNavPosition(raw: string | null): NavPosition {
  return NAV_POSITIONS.find((edge) => edge === raw) ?? "top";
}

/** The edge actually used: on a narrow screen the bar folds into a menu and is always at the top. */
export function effectivePosition(chosen: NavPosition, narrow: boolean): NavPosition {
  return narrow ? "top" : chosen;
}

/** Left and right turn the bar into a vertical rail. */
export function isVertical(position: NavPosition): boolean {
  return position === "left" || position === "right";
}

export type MenuPlacement = "bottom-end" | "top-end" | "right-end" | "left-end";

/** Where the account menu opens from the avatar: towards the free side of the window. */
export function menuPlacement(position: NavPosition): MenuPlacement {
  const placements: Record<NavPosition, MenuPlacement> = {
    top: "bottom-end",
    bottom: "top-end",
    left: "right-end",
    right: "left-end",
  };
  return placements[position];
}

export function readNavPosition(): NavPosition {
  try {
    return parseNavPosition(localStorage.getItem(NAV_POSITION_KEY));
  } catch {
    // Unreadable or blocked storage: the default edge.
    return "top";
  }
}

export function writeNavPosition(position: NavPosition) {
  try {
    localStorage.setItem(NAV_POSITION_KEY, position);
  } catch {
    // Blocked storage (private window, quota): the choice lasts until the page closes.
  }
}

// What components subscribed to, so a choice made on the Appearance page moves the bar at once, even when storage is
// blocked and the choice is only held here.
const listeners = new Set<() => void>();
let current: NavPosition | null = null;

function snapshot(): NavPosition {
  return (current ??= readNavPosition());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === NAV_POSITION_KEY || event.key === null) {
      current = readNavPosition();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The chosen navbar edge and a way to change it; kept in this browser, and read on the first render. */
export function useNavPosition(): [NavPosition, (position: NavPosition) => void] {
  const position = useSyncExternalStore(subscribe, snapshot, () => "top" as const);
  return [
    position,
    (next) => {
      current = next;
      writeNavPosition(next);
      listeners.forEach((listener) => listener());
    },
  ];
}

const SHORTCUT_KEYS: Record<string, NavPosition> = {
  ArrowUp: "top",
  ArrowDown: "bottom",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * The edge an Alt + Shift + arrow key press asks for, the arrow pointing at the edge; null for anything else. Plain
 * Alt + Left/Right is the browser's Back/Forward, and Shift + arrows select text, so only the two together count.
 */
export function shortcutPosition(event: {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): NavPosition | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null;
  return SHORTCUT_KEYS[event.key] ?? null;
}
