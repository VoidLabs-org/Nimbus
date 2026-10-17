import { useEffect } from "react";
import { shortcutPosition, useNavPosition } from "./navPosition";

/** Typing in a field: arrow keys belong to it, so the shortcut stands aside. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Alt + Shift + an arrow key moves the navbar to that edge (see shortcutPosition). Off while `enabled` is false: on a
 * narrow screen the bar is always at the top, so the keys would change a setting nobody can see.
 */
export function useNavShortcut(enabled: boolean) {
  const [, setPosition] = useNavPosition();
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const next = shortcutPosition(event);
      if (!next || isEditable(event.target)) return;
      event.preventDefault();
      setPosition(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, setPosition]);
}
