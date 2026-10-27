// Runs before the page, in the sandbox. It is CommonJS because a sandboxed preload can't load ES modules.
// The page only gets what is listed here (context isolation keeps the rest of Electron out of reach).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nimbusDesktop", {
  /** "darwin" (macOS), "win32" or "linux". */
  platform: process.platform,
  /** Tells the window whether the page shows a light or a dark theme, so its own buttons (Windows) match. */
  setTheme: (mode) => ipcRenderer.send("nimbus:theme", mode),
  /** Pops the app menu (Edit, View, Window) up at a point in the window; for Windows and Linux, which show no menu bar. */
  showAppMenu: (x, y) => ipcRenderer.send("nimbus:app-menu", { x, y }),
});
