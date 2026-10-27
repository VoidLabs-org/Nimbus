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
import { fileURLToPath } from "node:url";
import {
  appIconFile,
  isDevLaunch,
  menuPosition,
  menuTemplate,
  overlayColors,
  windowChrome,
} from "./chrome.js";
import { isNavigationAllowed, isNimbusPage, parseNimbusUrl } from "./nimbus-url.js";

const dev = isDevLaunch(process.argv);

/** The OS's light or dark mode, which the taskbar, the Dock and (until the page says) the window buttons follow. */
function osMode() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

/** The Nimbus icon for the OS's mode (see appIconFile). */
function appIcon() {
  return nativeImage.createFromPath(
    fileURLToPath(new URL(`../assets/${appIconFile(osMode())}`, import.meta.url)),
  );
}

/** Shows the icon for the OS's mode on every window (taskbar on Windows and Linux) and on the macOS Dock. */
function applyAppIcon() {
  const icon = appIcon();
  if (process.platform === "darwin") app.dock?.setIcon(icon);
  else for (const win of BrowserWindow.getAllWindows()) win.setIcon(icon);
}

function createWindow(nimbusUrl) {
  const win = new BrowserWindow({
    ...windowChrome(process.platform, osMode()),
    title: "Nimbus",
    icon: appIcon(),
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

app.whenReady().then(() => {
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

  createWindow(nimbusUrl);
  applyAppIcon();
  // The OS switched between light and dark: the taskbar or Dock changed colour, so the icon follows.
  nativeTheme.on("updated", applyAppIcon);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(nimbusUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
