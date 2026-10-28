import type { FloatingPosition } from "@mantine/core";
import { storedChoice } from "./storedChoice";

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

/** Where the account menu opens from the avatar: towards the free side of the window. */
export function menuPlacement(position: NavPosition): FloatingPosition {
  const placements: Record<NavPosition, FloatingPosition> = {
    top: "bottom-end",
    bottom: "top-end",
    left: "right-end",
    right: "left-end",
  };
  return placements[position];
}

// Kept in this browser; a choice made on the Appearance page moves the bar at once.
const navPosition = storedChoice(NAV_POSITION_KEY, parseNavPosition, "top");

export const readNavPosition = navPosition.read;

export const writeNavPosition = navPosition.write;

/** The chosen navbar edge and a way to change it; kept in this browser, and read on the first render. */
export function useNavPosition(): [NavPosition, (position: NavPosition) => void] {
  return navPosition.useChoice();
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

/** The media query below which the navbar folds into a menu and is always at the top. */
export const NARROW_QUERY = "(max-width: 61.99em)";

/** Mantine's corners for toasts. */
type ToastCorner = "top-right" | "bottom-right" | "bottom-left";

/** Where toasts appear: a corner the bar isn't on, so one never covers the bar (the account chip is at its end). */
export function notificationPosition(position: NavPosition): ToastCorner {
  const corners: Record<NavPosition, ToastCorner> = {
    top: "bottom-right",
    bottom: "top-right",
    left: "bottom-right",
    right: "bottom-left",
  };
  return corners[position];
}

const NON_TYPING_INPUTS = [
  "radio",
  "checkbox",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
];

/**
 * Whether an element takes typed text, so keyboard shortcuts stand aside: text-like inputs, textareas, selects (arrow
 * keys change their choice) and editable areas. Radio buttons, checkboxes and buttons don't.
 */
export function takesTyping(element: {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}): boolean {
  if (element.isContentEditable) return true;
  if (element.tagName === "TEXTAREA" || element.tagName === "SELECT") return true;
  return element.tagName === "INPUT" && !NON_TYPING_INPUTS.includes(element.type ?? "text");
}

// Which navbar control had keyboard focus when the shortcut moved the bar: its layout is rebuilt, so the same control
// in the new layout gets the focus back (see AppShell).
let focusedControl: string | null = null;

/** Notes the control (its data-nav-focus) that has focus, before the bar changes layout. */
export function rememberNavFocus(control: string | null) {
  focusedControl = control;
}

/** The control to give focus back to, once; null if focus wasn't in the bar. */
export function takeNavFocus(): string | null {
  const control = focusedControl;
  focusedControl = null;
  return control;
}
