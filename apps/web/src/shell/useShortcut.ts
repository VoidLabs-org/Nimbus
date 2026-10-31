import { useEffect, useEffectEvent } from "react";

/**
 * Runs `run` on a key press `matches` says is its shortcut, anywhere in the window, unless something handled the
 * press first or it is part of typing with an input method (IME). The listener is added once; it always uses the
 * latest `matches` and `run`.
 */
export function useShortcut(matches: (event: KeyboardEvent) => boolean, run: () => void) {
  const isShortcut = useEffectEvent(matches);
  const onShortcut = useEffectEvent(run);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !isShortcut(event)) return;
      event.preventDefault();
      onShortcut();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
