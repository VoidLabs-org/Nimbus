// Electron main process: a thin desktop shell around the web app (apps/web).
import { app, BrowserWindow, net, protocol, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const isDev = process.argv.includes("--dev");
const DEV_URL = "http://localhost:3000";
const APP_URL = "app://nimbus/";
const WEB_DIST = fileURLToPath(new URL("../../web/dist/", import.meta.url));

// Production loads the built web app from a custom protocol instead of file://
// (Electron security checklist #18). Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serveWebDist() {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.resolve(WEB_DIST, `.${decodeURIComponent(pathname)}`);
    const relative = path.relative(WEB_DIST, filePath);
    // Block paths that escape the dist folder, e.g. app://nimbus/../../secret.txt
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return new Response("Bad request", { status: 400 });
    }
    // Client-side routes (no file extension) fall back to index.html
    const target = path.extname(filePath) ? filePath : path.join(WEB_DIST, "index.html");
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, title: "Nimbus" });
  const appOrigin = new URL(isDev ? DEV_URL : APP_URL).origin;

  // Open external links in the default browser instead of new Electron windows (#14, #15)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      setImmediate(() => shell.openExternal(url));
    }
    return { action: "deny" };
  });

  // Never navigate the app window away from the app itself (#13)
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== appOrigin) event.preventDefault();
  });

  win.loadURL(isDev ? DEV_URL : APP_URL);
}

app.whenReady().then(() => {
  if (!isDev) serveWebDist();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
