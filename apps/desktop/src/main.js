// Electron main process: a desktop shell around the web app (apps/web). It loads Nimbus from a URL (ADR 0007).
import { app, BrowserWindow, dialog, shell } from "electron";
import { fileURLToPath } from "node:url";
import { isNavigationAllowed, parseNimbusUrl } from "./nimbus-url.js";

function createWindow(nimbusUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Nimbus",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      sandbox: true,
    },
  });

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
  createWindow(nimbusUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(nimbusUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
