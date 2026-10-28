// Where the app window was, kept between starts, as plain functions so they can be tested without starting Electron.
// main.js applies them.
import { MIN_WINDOW } from "./chrome.js";

/**
 * The app window's place as saved in the user data folder: its normal bounds (not maximized or full screen) and
 * whether it was maximized.
 *
 * @param {{ x: number, y: number, width: number, height: number }} bounds
 * @param {boolean} maximized
 */
export function windowState(bounds, maximized) {
  const { x, y, width, height } = bounds;
  return JSON.stringify({ x, y, width, height, maximized });
}

/**
 * The saved place, or null when there is none or it can't be read.
 *
 * @param {string | null} text
 * @returns {{ x: number, y: number, width: number, height: number, maximized: boolean } | null}
 */
export function parseWindowState(text) {
  if (text === null) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { x, y, width, height, maximized } = value;
  if (![x, y, width, height].every(Number.isInteger)) return null;
  // Below the smallest window (see windowChrome) it is not a real size.
  if (width < MIN_WINDOW.width || height < MIN_WINDOW.height) return null;
  return { x, y, width, height, maximized: maximized === true };
}

/** How much of `a` lies on `b`, in square pixels. */
function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Where to open the window from its saved place and the screens there are now. It goes to the screen most of it was
 * on, made no bigger than that screen (nor smaller than the smallest window) and moved onto it, so it can always be dragged and resized there (after
 * undocking from a large monitor, say). On no screen at all (that screen was unplugged) it opens centred at its usual
 * size (`bounds` null); either way it is maximized again if it was.
 *
 * @param {{ x: number, y: number, width: number, height: number, maximized: boolean }} state
 * @param {{ x: number, y: number, width: number, height: number }[]} workAreas
 * @returns {{ bounds: { x: number, y: number, width: number, height: number } | null, maximized: boolean }}
 */
export function restoredPlace(state, workAreas) {
  const { maximized } = state;
  let best = null;
  let bestOverlap = 0;
  for (const area of workAreas) {
    const shared = overlap(state, area);
    if (shared > bestOverlap) [best, bestOverlap] = [area, shared];
  }
  if (!best) return { bounds: null, maximized };
  // Never below the smallest window, though: on a screen smaller than that it starts at the screen's corner instead.
  const width = Math.max(MIN_WINDOW.width, Math.min(state.width, best.width));
  const height = Math.max(MIN_WINDOW.height, Math.min(state.height, best.height));
  return {
    bounds: {
      x: clamp(state.x, best.x, Math.max(best.x, best.x + best.width - width)),
      y: clamp(state.y, best.y, Math.max(best.y, best.y + best.height - height)),
      width,
      height,
    },
    maximized,
  };
}
