import type { NavPosition } from "./navPosition";

/** A corner of the window, where the navbar folds up into a pill and unfolds again. */
export type Corner = "tl" | "tr" | "bl" | "br";

/*
 * How long each part of a move takes. The geometry changes in CSS (AppShell.module.css, `--nav-ms`) take the same time,
 * so keep the two in step.
 */
export const RETRACT_MS = 260;
export const TRAVEL_MS = 240;
/** After the layout swaps inside the pill, before it extends: a frame or two for it to take effect. */
export const SETTLE_MS = 40;

/** The corner two neighbouring edges share, keyed by the two edges in alphabetical order. */
const SHARED: Record<string, Corner> = {
  "bottom-left": "bl",
  "bottom-right": "br",
  "left-top": "tl",
  "right-top": "tr",
};

/**
 * The corners the navbar visits, folded into a pill, going from one edge to another: neighbouring edges share a corner
 * (it retracts into it and extends out of it); opposite edges are joined by sliding along a side (the left one for top
 * and bottom, the top one for left and right).
 */
export function planMove(from: NavPosition, to: NavPosition): Corner[] {
  const shared = SHARED[[from, to].sort().join("-")];
  if (shared) return [shared];
  if (from === "top") return ["tl", "bl"];
  if (from === "bottom") return ["bl", "tl"];
  if (from === "left") return ["tl", "tr"];
  return ["tr", "tl"];
}

/**
 * Where a move has got to. `shown` is the layout on screen (the old edge until the swap); `phase` is "pill" while the bar
 * is folded and moving, "arrive" once the new layout is in the pill and about to extend, and "idle" otherwise.
 */
export type MoveState = {
  shown: NavPosition;
  to: NavPosition;
  phase: "idle" | "pill" | "arrive";
  corner: Corner;
  /** Corners still to visit after this one. */
  rest: Corner[];
  /** 0 for the retract, then 1 for each slide along a side. */
  leg: number;
};

export function idleAt(position: NavPosition, corner: Corner = "tl"): MoveState {
  return { shown: position, to: position, phase: "idle", corner, rest: [], leg: 0 };
}

/** The first step of a move: fold into the first corner. */
export function startMove(from: NavPosition, to: NavPosition): MoveState {
  const [first, ...rest] = planMove(from, to) as [Corner, ...Corner[]];
  return { shown: from, to, phase: "pill", corner: first, rest, leg: 0 };
}

/** The next step: slide to the next corner, or swap the layout once at the last, or finish. */
export function advanceMove(state: MoveState): MoveState {
  if (state.phase === "pill") {
    const [next, ...rest] = state.rest;
    if (next) return { ...state, corner: next, rest, leg: state.leg + 1 };
    return { ...state, shown: state.to, phase: "arrive" };
  }
  if (state.phase === "arrive") return { ...state, phase: "idle", leg: 0 };
  return state;
}

/** How long to stay in this step before the next. */
export function moveDelay(state: MoveState): number {
  if (state.phase === "arrive") return SETTLE_MS;
  return state.leg === 0 ? RETRACT_MS : TRAVEL_MS;
}
