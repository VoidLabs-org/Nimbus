// Electron main process: a desktop shell around the web app (apps/web). It loads Nimbus from a URL (ADR 0007).
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
} from "electron";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  appIconFile,
  isDevLaunch,
  menuPosition,
  menuTemplate,
  overlayColors,
  PERSONALIZE_KEY,
  windowChrome,
  windowsTaskbarMode,
} from "./chrome.js";
import { isNavigationAllowed, isNimbusPage, parseNimbusUrl } from "./nimbus-url.js";

const dev = isDevLaunch(process.argv);

const execFileAsync = promisify(execFile);

/** The OS's light or dark mode for apps, which the window buttons follow until the page says its theme. */
function osMode() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

/**
 * The mode the taskbar or Dock is drawn in. On Windows that is Windows mode, which can differ from the apps' mode
 * (by default Windows is dark and apps light), so it is read from the registry; elsewhere it is the OS's mode.
 */
async function taskbarMode() {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("reg", [
        "query",
        PERSONALIZE_KEY,
        "/v",
        "SystemUsesLightTheme",
      ]);
      const mode = windowsTaskbarMode(stdout);
      if (mode) return mode;
    } catch {
      // No such setting (an older Windows): the apps' mode will do.
    }
  }
  return osMode();
}

/** The Nimbus icon showing now, and its file; null until the first look at the taskbar's mode. */
let appIcon = null;
let appIconShown = null;

/**
 * Shows the Nimbus icon for the taskbar's or Dock's mode (see appIconFile) on every window (the taskbar button on
 * Windows and Linux) and on the macOS Dock; nothing when it already shows.
 */
async function updateAppIcon() {
  const file = appIconFile(await taskbarMode());
  if (file === appIconShown) return;
  appIconShown = file;
  appIcon = nativeImage.createFromPath(
    fileURLToPath(new URL(`../assets/${file}`, import.meta.url)),
  );
  if (process.platform === "darwin") app.dock?.setIcon(appIcon);
  else for (const win of BrowserWindow.getAllWindows()) win.setIcon(appIcon);
}

function createWindow(nimbusUrl) {
  const win = new BrowserWindow({
    ...windowChrome(process.platform, osMode()),
    title: "Nimbus",
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      devTools: dev,
    },
  });
  // Windows and Linux keep the menu for its shortcuts but never show it (see menuTemplate).
  win.setMenuBarVisibility(false);

  // Open external links in the default browser instead of new Electron windows (#14, #15)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      setImmediate(() => shell.openExternal(url));
    }
    return { action: "deny" };
  });

  // The window stays on Nimbus, or on the provider sign-in page Nimbus sent it to, where the provider's own form
  // must work (#13). Redirects through Google or GitHub and back are not page navigations, so they are not checked.
  win.webContents.on("will-navigate", (event, url) => {
    if (!isNavigationAllowed(nimbusUrl, win.webContents.getURL(), url)) event.preventDefault();
  });

  win.loadURL(nimbusUrl.href);
}

app.whenReady().then(async () => {
  let nimbusUrl;
  try {
    nimbusUrl = parseNimbusUrl(process.env.NIMBUS_URL);
  } catch (error) {
    dialog.showErrorBox("Nimbus can't start", error.message);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(process.platform, dev)));

  // The page's theme (nimbusDesktop.setTheme), for the Windows buttons' colours. nativeTheme.themeSource is left alone:
  // setting it would also fix the page's prefers-color-scheme, so the System theme would stop following the OS.
  ipcMain.on("nimbus:theme", (event, mode) => {
    if (
      (mode !== "light" && mode !== "dark") ||
      !isNimbusPage(nimbusUrl, event.senderFrame?.url ?? "")
    )
      return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && process.platform === "win32") win.setTitleBarOverlay(overlayColors(mode));
  });

  // The Nimbus icon at the top left of the page (Windows and Linux, which show no menu bar) pops the app menu up there.
  ipcMain.on("nimbus:app-menu", (event, position) => {
    const at = menuPosition(position);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!at || !win || !isNimbusPage(nimbusUrl, event.senderFrame?.url ?? "")) return;
    Menu.getApplicationMenu()?.popup({ window: win, ...at });
  });

  // Looked at before the window opens, so it opens with the right icon.
  await updateAppIcon();
  createWindow(nimbusUrl);
  // The OS switched between light and dark: the taskbar or Dock changed colour, so the icon follows. Windows mode
  // alone may change without telling Electron, so on Windows it is looked at again when the window comes forward.
  nativeTheme.on("updated", () => void updateAppIcon());
  if (process.platform === "win32") app.on("browser-window-focus", () => void updateAppIcon());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(nimbusUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
