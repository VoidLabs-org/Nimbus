// Where the app window was, kept between starts, as plain functions so they can be tested without starting Electron.
// main.js applies them.
import { TITLE_ROW_HEIGHT } from "./chrome.js";

/** The app window's smallest size (see windowChrome); a saved size below it is not a real one. */
const MIN_WIDTH = 800;
const MIN_HEIGHT = 560;

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
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
  return { x, y, width, height, maximized: maximized === true };
}

/** How much of the title row must be on a screen to drag the window by it. */
const VISIBLE_ROW = 100;

/**
 * The saved place to open the app window at, or null (it opens centred) when its title row isn't on any of the
 * screens now, as when the screen it was on has been unplugged: a window there couldn't be dragged back.
 *
 * @param {{ x: number, y: number, width: number, height: number, maximized: boolean }} state
 * @param {{ x: number, y: number, width: number, height: number }[]} workAreas
 */
export function restoredBounds(state, workAreas) {
  const onScreen = workAreas.some((area) => {
    const width = Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x);
    const height =
      Math.min(state.y + TITLE_ROW_HEIGHT, area.y + area.height) - Math.max(state.y, area.y);
    return width >= VISIBLE_ROW && height >= TITLE_ROW_HEIGHT / 2;
  });
  return onScreen ? state : null;
}
