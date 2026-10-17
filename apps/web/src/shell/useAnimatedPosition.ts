import { useReducedMotion } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { advanceMove, idleAt, moveDelay, startMove, type Corner } from "./navMove";
import type { NavPosition } from "./navPosition";

/**
 * The navbar edge to draw, following `target` the way a snake goes round a corner: when the edge changes, the bar folds
 * up into a pill in a corner, its layout swaps there (where nobody sees the contents change), and it unfolds along the
 * new edge. Opposite edges are joined by the pill sliding along a side. `folded` and `corner` say where the pill is.
 * On a narrow screen, or with reduced motion, the edge changes at once.
 */
export function useAnimatedPosition(
  target: NavPosition,
  narrow: boolean,
): { shown: NavPosition; folded: boolean; corner: Corner } {
  const reduceMotion = useReducedMotion();
  const instant = narrow || reduceMotion;
  const [state, setState] = useState(() => idleAt(target));
  const [wasNarrow, setWasNarrow] = useState(narrow);

  // Adjusting state to the props while rendering: catch up at once, or begin a move. Crossing the narrow breakpoint
  // is a resize, not a choice, so the bar goes to its edge without the fold.
  if (narrow !== wasNarrow) {
    setWasNarrow(narrow);
    setState(idleAt(target, state.corner));
  } else if (instant && (state.shown !== target || state.phase !== "idle")) {
    setState(idleAt(target, state.corner));
  } else if (!instant && state.phase === "idle" && state.shown !== target) {
    setState(startMove(state.shown, target));
  }

  // Each step of a move lasts a while, then the next begins. A change of state (or leaving) cancels the wait.
  useEffect(() => {
    if (state.phase === "idle") return;
    const timer = setTimeout(() => setState(advanceMove), moveDelay(state));
    return () => clearTimeout(timer);
  }, [state]);

  return {
    shown: instant ? target : state.shown,
    folded: !instant && state.phase !== "idle",
    corner: state.corner,
  };
}
