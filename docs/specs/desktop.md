# desktop

The Electron app (`apps/desktop`): a window around the web app (`apps/web`). It is not a backend module, so there is no public interface or events here; this describes how it works now. Features of the Desktop app are planned in #177; this file grows with each ticket.

## Where it loads Nimbus from (ADR 0007)

The window opens `NIMBUS_URL`, read when the app starts. The default is `http://localhost:3000`, the dev server, so `pnpm dev:desktop` (API, web and the window) needs nothing set. It must be an `http` or `https` address; anything else shows an error box naming the variable and quits.

| Command                                              | Does                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev:desktop`                                   | Starts the API, the web dev server and the window on it                         |
| `NIMBUS_URL=https://... pnpm --filter desktop start` | Opens the window on another Nimbus (a hosted one, or someone else's dev server) |

The window shows the website exactly as a browser would, so `/api` calls, the refresh cookie and Google and GitHub sign-in work the same. There is no copy of the web app inside the Desktop app.

## The window

- **Navigation.** The window may navigate within Nimbus's origin, and within the origin of the page it is showing (`isNavigationAllowed` in `src/nimbus-url.js`), so a Google or GitHub sign-in page, which Nimbus redirects the window to, can submit its own form. A hop from one site to another (a Nimbus page linking to a stranger, a provider page linking to a third site) is blocked, as is any non-http(s) address. A `window.open` or `target=_blank` link to an http(s) address opens in the default browser. Redirects through a provider and back are not page navigations, so they are not checked. The window has no address bar or back button; closing and reopening the app returns to `NIMBUS_URL`.
- **Security.** `contextIsolation` and `sandbox` are on. The page gets only `window.nimbusDesktop` from the preload script (`src/preload.cjs`). The web app treats its presence as "this is the Desktop app".
- **Frame** (`windowChrome` in `src/chrome.js`). The window opens at 1280×800 and is never smaller than 800×560. The title bar is hidden (`titleBarStyle: "hidden"`), so the page draws its own frame, as in the design (2a): the Sidebar down the left and a 46px title row over the page (Tabs go there), both in the theme's surface colour, with the page in its background colour beside them. The top 46px (the Sidebar's top row and the title row) are the drag area; buttons in them opt out. On Windows the OS draws its window buttons over the right end of the title row (`titleBarOverlay`, see-through, symbols coloured for the page's theme); on macOS the traffic lights are inset into the Sidebar's top row; Linux keeps the native frame, so there the empty title row is hidden until Tabs fill it. Pages outside the shell (Login, Register, the session check, Session expired) get a 46px drag strip across the top instead (`DesktopFrame`), and start below it, clear of the window's buttons; not on Linux.
- **Menu** (`menuTemplate`). macOS has a minimal menu: the app menu, Edit, View (actual size, zoom in and out, full screen) and Window. Windows and Linux have Edit, View and Window too, but no menu bar: their shortcuts work, and the Nimbus icon at the top left of the page pops the menu up under itself (`showAppMenu`), as Notion's icon does. Reload, force reload and developer tools are only there with `--dev` (which `pnpm dev:desktop` passes); without it developer tools are off altogether.

## `window.nimbusDesktop`

| Member              | What it is                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform`          | `"darwin"`, `"win32"` or `"linux"`                                                                                                                                                                                                                                                               |
| `setTheme(mode)`    | The page says whether its theme is `"light"` or `"dark"`. On Windows, main colours the window buttons to match. It does not set `nativeTheme.themeSource`, which would also fix the page's `prefers-color-scheme` and stop the System theme following the OS. Only Nimbus's own pages are heard. |
| `showAppMenu(x, y)` | Pops the app menu up at that point in the window (Windows and Linux; whole pixels inside the window, anything else is ignored). Only Nimbus's own pages are heard.                                                                                                                               |

The preload script runs on every page the window shows, a provider's sign-in page too; main ignores `nimbus:theme` messages from any origin but `NIMBUS_URL`'s (`isNimbusPage`).

## The shell (web app)

When `window.nimbusDesktop` is there, signed-in pages use `DesktopShell` (`apps/web/src/shell/DesktopShell.tsx`) instead of the browser's navbar (`AppShell`). It is loaded as its own chunk, so the browser never downloads it, and the browser's navbar is unchanged. If the chunk can't load (a redeploy removed it while the window stayed open, or the connection dropped), the navbar shell is shown instead of a blank window. `DesktopFrame`, on every page, sends the theme to the window (`setTheme`) and sets `data-desktop` on the root element for the frame's stylesheet.

- **Sidebar.** On the left: the account (picture, name and email, opening the account menu with Sign out), a place for the Notification bell once Notifications exist, then Home, Projects and Settings (the same `DESTINATIONS` as the browser's navbar). There is no brand row, as in other desktop apps; on Windows and Linux the Nimbus icon at the top left opens the app menu. Settings' own pages are listed on the Settings overview, not in the Sidebar. The open page's link is highlighted; Settings is highlighted on every page under it.
- **Folded.** Like the Claude app's, the Sidebar folds away completely and the page gets the whole width. The Sidebar button stays in one place at the top left, whether the Sidebar is open or folded (after the Nimbus icon on Windows and Linux, just right of the traffic lights on macOS); it and the shortcut switch between open and folded. The choice is kept on this computer (`localStorage` key `nimbus-sidebar`, default open). While folded, resting the pointer on the button for 300ms peeks the Sidebar out over the page without opening it for good; it goes when the pointer moves onto the page, on Esc, or when a page is opened from it, and clicking the button while peeking opens it. While the window is under 960px wide the Sidebar folds itself without changing the choice; the button or shortcut opens it until the window is widened.
- **Appearance.** In the Desktop app the Appearance page offers "Sidebar: Open / Folded" in place of the navbar position.
- **Toasts** appear bottom right.

## Shortcuts

| Shortcut                         | Does                       |
| -------------------------------- | -------------------------- |
| Ctrl `\` (⌘ `\` on macOS)        | Folds or opens the Sidebar |
| Ctrl `+`, Ctrl `-`, Ctrl `0` (⌘) | Zoom in, out, actual size  |
| F11 (Ctrl ⌘ F on macOS)          | Full screen                |
| Ctrl R, Ctrl Shift I (`--dev`)   | Reload, developer tools    |

## Tests

`pnpm --filter desktop test` runs plain Node tests (`node --test`) for reading `NIMBUS_URL`, which navigations the window allows, which pages may call main, and the window's frame and menu, without starting Electron. The Sidebar is tested in the web app (`DesktopShell.test.tsx`) with `window.nimbusDesktop` faked.
