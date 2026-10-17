import { useEffect } from "react";
import { rememberNavFocus, shortcutPosition, takesTyping, useNavPosition } from "./navPosition";

/** A dialog (a Mantine modal) is open: the page behind it isn't the User's focus, so the bar doesn't move under it. */
function dialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Alt + Shift + an arrow key moves the navbar to that edge (see shortcutPosition). It stands aside while someone is
 * typing in a field, while a dialog is open, and for a key something else already handled. If the keyboard focus was on
 * a navbar control, the same control in the new layout gets it back (see AppShell). Off while `enabled` is false: on a
 * narrow screen the bar is always at the top, so the keys would change a setting nobody can see.
 */
export function useNavShortcut(enabled: boolean) {
  const [, setPosition] = useNavPosition();
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const next = shortcutPosition(event);
      if (!next || event.defaultPrevented || dialogOpen()) return;
      if (event.target instanceof HTMLElement && takesTyping(event.target)) return;
      event.preventDefault();
      const control =
        event.target instanceof Element
          ? (event.target.closest("[data-nav-focus]")?.getAttribute("data-nav-focus") ?? null)
          : null;
      rememberNavFocus(control);
      setPosition(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, setPosition]);
}
