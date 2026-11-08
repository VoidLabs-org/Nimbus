import { createContext, useContext, type KeyboardEvent, type MouseEvent } from "react";
import type { Issue } from "../api/client";

/** Where an Issue's menu opens (the pointer, or under the focused card or row), and what gets focus back after. */
export type OpenIssueMenu = (issue: Issue, at: { x: number; y: number }, from: HTMLElement) => void;

/** The Issue menu of the view: whether an Issue has one (only one the User may move), and opening it. */
export const IssueMenuContext = createContext<{
  has: (issue: Issue) => boolean;
  open: OpenIssueMenu;
} | null>(null);

/** The element focus returns to: the link or button the event came from, else the card or row itself. */
function returnTo(event: { target: EventTarget; currentTarget: EventTarget }) {
  const target = event.target as HTMLElement;
  return target.closest<HTMLElement>("a, button") ?? (event.currentTarget as HTMLElement);
}

/**
 * The handlers that open an Issue's menu from a card or row: a right-click (instead of the browser's menu), or the
 * context-menu key or Shift+F10 on it. Nothing, and the browser's own menu, when it has none.
 */
export function useIssueMenu(issue: Issue) {
  const menu = useContext(IssueMenuContext);
  if (!menu || !menu.has(issue)) return {};
  return {
    onContextMenu(event: MouseEvent<HTMLElement>) {
      event.preventDefault();
      menu.open(issue, { x: event.clientX, y: event.clientY }, returnTo(event));
    },
    onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      event.stopPropagation();
      const box = event.currentTarget.getBoundingClientRect();
      menu.open(issue, { x: box.left + 16, y: box.bottom }, returnTo(event));
    },
  };
}
