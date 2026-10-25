// Electron main process: a thin desktop shell around the web app (apps/web).
import { app, BrowserWindow, dialog, net, protocol, safeStorage, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApiProxy, parseApiUrl } from "./api-proxy.js";
import { createCookieStore } from "./cookie-store.js";
import { resolveWebFile } from "./static-files.js";

const isDev = process.argv.includes("--dev");
const DEV_URL = "http://localhost:3000";
const APP_URL = "app://nimbus/";
const WEB_DIST = fileURLToPath(new URL("../../web/dist/", import.meta.url));

// Production loads the built web app from a custom protocol instead of file://
// (Electron security checklist #18). Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// The built app is served from app://nimbus. Its /api calls go to the real API (NIMBUS_API_URL), which this process
// talks to for it and whose cookies it keeps, because a page on app:// can't carry them (ADR 0007).
async function serveWebDist(apiUrl) {
  const cookieStore = createCookieStore({
    file: path.join(app.getPath("userData"), "api-cookies.bin"),
    safeStorage,
  });
  const jar = await cookieStore.load();
  const proxyApi = createApiProxy({
    apiUrl,
    jar,
    onChange: () =>
      cookieStore.save(jar).catch((error) => console.error("Could not save the sign-in:", error)),
  });

  protocol.handle("app", async (request) => {
    const proxied = await proxyApi(request);
    if (proxied) return proxied;

    const found = resolveWebFile(WEB_DIST, new URL(request.url).pathname);
    if ("error" in found) return new Response(found.error, { status: 400 });
    return net.fetch(pathToFileURL(found.file).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Nimbus",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      // The preload reads this: only the built app on app://nimbus is "packaged".
      additionalArguments: isDev ? [] : ["--nimbus-packaged"],
    },
  });
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

app.whenReady().then(async () => {
  if (!isDev) {
    let apiUrl;
    try {
      apiUrl = parseApiUrl(process.env.NIMBUS_API_URL);
    } catch (error) {
      dialog.showErrorBox("Nimbus can't start", error.message);
      app.quit();
      return;
    }
    await serveWebDist(apiUrl);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
