// The window's frame and menu, as plain data so they can be tested without starting Electron. main.js applies them.

/** The height of the page's title row (the drag area). The Windows window buttons are drawn over it, at this height. */
export const TITLE_ROW_HEIGHT = 46;

/** Whether the app was started for development (`electron . --dev`): only then can it reload or open developer tools. */
export function isDevLaunch(argv) {
  return argv.includes("--dev");
}

/**
 * The window buttons' colours on Windows: drawn on a see-through strip over the page's title row, with symbols that
 * show up on the theme's page colour (the OS would pick them from its own light or dark setting, not Nimbus's).
 *
 * @param {"light" | "dark"} mode
 */
export function overlayColors(mode) {
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "#f3eee8" : "#201d1a",
    height: TITLE_ROW_HEIGHT,
  };
}

/**
 * The Nimbus icon for the taskbar, the window and the Dock (in `assets/`), for the OS's light or dark mode: those are
 * drawn in the OS's colours, not the page's theme. The light-mode file is the dark mark, the dark-mode one the light.
 *
 * @param {"light" | "dark"} mode
 */
export function appIconFile(mode) {
  return mode === "dark" ? "nimbus-icon-dark.png" : "nimbus-icon-light.png";
}

/**
 * The app window's options apart from webPreferences: never smaller than 800×560, and a hidden title bar, so the page
 * draws its own frame (the Sidebar and a title row). Windows keeps its buttons drawn by the OS over the right end of
 * the title row; macOS keeps its traffic lights, inset into the Sidebar's top row; Linux keeps the native frame.
 *
 * @param {NodeJS.Platform} platform
 * @param {"light" | "dark"} mode the OS's, until the page says which theme it shows
 */
export function windowChrome(platform, mode) {
  const size = { width: 1280, height: 800, minWidth: 800, minHeight: 560 };
  if (platform === "darwin") {
    return { ...size, titleBarStyle: "hidden", trafficLightPosition: { x: 14, y: 17 } };
  }
  if (platform === "win32") {
    return { ...size, titleBarStyle: "hidden", titleBarOverlay: overlayColors(mode) };
  }
  return size;
}

/**
 * The application menu. macOS shows a minimal one (the app, Edit, View with zoom and full screen, Window); Windows and
 * Linux get Edit, View and Window too but never show a menu bar (main hides it): their shortcuts still work, and the
 * Nimbus icon at the top left of the page pops the menu up (nimbusDesktop.showAppMenu), like Notion's. Their Window
 * menu closes the window with Ctrl Shift W, not the usual Ctrl W, which the page keeps for closing a Tab. Reload and
 * developer tools are there only for development.
 *
 * @param {NodeJS.Platform} platform
 * @param {boolean} dev
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
export function menuTemplate(platform, dev) {
  const view = {
    label: "View",
    submenu: [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      ...(dev
        ? [
            { type: "separator" },
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
          ]
        : []),
    ],
  };
  const edit = { role: "editMenu" };
  if (platform === "darwin") return [{ role: "appMenu" }, edit, view, { role: "windowMenu" }];
  const window = {
    label: "Window",
    submenu: [{ role: "minimize" }, { role: "close", accelerator: "Ctrl+Shift+W" }],
  };
  return [edit, view, window];
}

/**
 * Where the page asks the app menu to pop up (nimbusDesktop.showAppMenu): whole pixels inside the window, or null for
 * anything else, so a bad message is ignored.
 *
 * @param {unknown} value
 * @returns {{ x: number, y: number } | null}
 */
export function menuPosition(value) {
  if (typeof value !== "object" || value === null) return null;
  const { x, y } = /** @type {{ x?: unknown, y?: unknown }} */ (value);
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y))
    return null;
  if (x < 0 || y < 0) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
