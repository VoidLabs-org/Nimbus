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
- **Frame** (`windowChrome` in `src/chrome.js`). The window opens at 1280×800 and is never smaller than 800×560. The title bar is hidden (`titleBarStyle: "hidden"`), so the page draws its own frame, as in the design (2a): the Sidebar down the left and a 46px title row over the page holding the Tabs, both in the theme's surface colour, with the page in its background colour beside them. The top 46px (the Sidebar's top row and the title row) are the drag area; the Tabs and buttons in them opt out. On Windows the OS draws its window buttons over the right end of the title row (`titleBarOverlay`, see-through, symbols coloured for the page's theme); on macOS the traffic lights are inset into the Sidebar's top row; Linux keeps the native frame, with the title row under it. Pages outside the shell (Login, Register, the session check, Session expired) get a 46px drag strip across the top instead (`DesktopFrame`), and start below it, clear of the window's buttons; not on Linux.
- **Icon** (`appIconFile`). The window, taskbar and Dock show the Nimbus icon from `apps/desktop/assets`, in the version for the OS's light or dark mode (the dark mark on light, the light mark on dark), since the taskbar and Dock are drawn in the OS's colours, not the page's theme. It changes when the OS switches mode. The files are copies of `apps/web/public/nimbus-icon-*.png`.
- **Menu** (`menuTemplate`). macOS has a minimal menu: the app menu, Edit, View (actual size, zoom in and out, full screen) and Window. Windows and Linux have Edit, View and Window (Minimize, and Close on Ctrl Shift W, since Ctrl W closes a Tab) too, but no menu bar: their shortcuts work, and the Nimbus icon at the top left of the page pops the menu up under itself (`showAppMenu`), as Notion's icon does. Reload, force reload and developer tools are only there with `--dev` (which `pnpm dev:desktop` passes); without it developer tools are off altogether.

## `window.nimbusDesktop`

| Member              | What it is                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform`          | `"darwin"`, `"win32"` or `"linux"`                                                                                                                                                                                                                                                               |
| `setTheme(mode)`    | The page says whether its theme is `"light"` or `"dark"`. On Windows, main colours the window buttons to match. It does not set `nativeTheme.themeSource`, which would also fix the page's `prefers-color-scheme` and stop the System theme following the OS. Only Nimbus's own pages are heard. |
| `showAppMenu(x, y)` | Pops the app menu up at that point in the window (Windows and Linux; whole pixels inside the window, anything else is ignored). Only Nimbus's own pages are heard.                                                                                                                               |

The preload script runs on every page the window shows, a provider's sign-in page too; main ignores `nimbus:theme` messages from any origin but `NIMBUS_URL`'s (`isNimbusPage`).

## The shell (web app)

When `window.nimbusDesktop` is there, signed-in pages use `DesktopShell` (`apps/web/src/shell/DesktopShell.tsx`) instead of the browser's navbar (`AppShell`). It is loaded as its own chunk, so the browser never downloads it, and the browser's navbar is unchanged. If the chunk can't load (a redeploy removed it while the window stayed open, or the connection dropped), the navbar shell is shown instead of a blank window. `DesktopFrame`, on every page, sends the theme to the window (`setTheme`) and sets `data-desktop` on the root element for the frame's stylesheet.

- **Sidebar.** On the left: Home and Projects at the top; Settings and the account (picture, name and email, opening the account menu with Sign out, upwards) at the bottom, with a place for the Notification bell beside the account once Notifications exist. The links are the same `DESTINATIONS` as the browser's navbar. There is no brand row, as in other desktop apps; on Windows and Linux the Nimbus icon at the top left opens the app menu. Settings opens the Settings overlay (below); it is highlighted while the overlay is open. The open page's link is highlighted.
- **Folded.** Like the Claude app's, the Sidebar folds away completely and the page gets the whole width. The Sidebar button stays in one place at the top left, whether the Sidebar is open or folded (after the Nimbus icon on Windows and Linux, just right of the traffic lights on macOS); it and the shortcut switch between open and folded. The choice is kept on this computer (`localStorage` key `nimbus-sidebar`, default open). While folded, resting the pointer on the button for 300ms peeks the Sidebar out over the page without opening it for good; it goes when the pointer moves onto the page, on Esc, or when a page is opened from it, and clicking the button while peeking opens it. While the window is under 960px wide the Sidebar folds itself without changing the choice; the button or shortcut opens it until the window is widened.
- **Appearance.** In the Desktop app the Appearance page has only the theme: there is no navbar to position, and the Sidebar folds with its button or the shortcut, which is remembered.
- **Toasts** appear bottom right.

## Tabs

Each page the User opens gets a Tab in the title row (design 2a), as in a browser, so they can go back to it (`useTabs` and `TabRow` in `apps/web/src/shell`, the rules in `tabs.ts`).

- **Which pages.** Home, Projects and a project (`isTabPath`): the signed-in pages but Settings, which opens over a Tab's page. An address that is no page (Not found) gets no Tab and none is selected; signed-out pages are outside the shell, so they never get one.
- **Opening.** A Tab is a path: opening a page that has a Tab selects it, and the query string doesn't count. A new Tab goes at the end of the row. Clicking a Tab opens its page.
- **Names.** Like the page's breadcrumb: its last crumb (`tabTitle` in `crumbs.ts`), so a project shows its name. `BreadcrumbTrail` hands it to the shell (`TabTitleContext`); until it loads, a project's Tab shows its key and the others their Sidebar name. Long names are cut short, in full on hover.
- **Closing.** Its ✕, a middle click, or Ctrl W (⌘ W on macOS) for the selected one. Closing the selected Tab opens the one after it, or else the one before; closing the last opens Home, which gets a Tab of its own. Closing another Tab leaves the page as it is.
- **Switching** is a normal page change: no page is kept alive in the background, so a page's own state (a half-typed form) does not survive it; its data comes back from the TanStack Query cache.
- **The row** is only as wide as its Tabs, so the rest of the title row (and the window buttons' area) stays the drag area. When they don't fit it scrolls sideways, keeping the selected Tab in view.
- **Kept per User.** The Tabs and the selected one are kept on this computer under `nimbus-tabs:<User id>`, so another User signing in here never sees them, and are restored when the shell starts for that User: after a restart or a new sign-in. Starting on Home (the window's start address, or where signing in lands) goes back to the Tab the User was on; any other start address is opened as usual. A restored Tab whose address is no longer a page is dropped; a project the User may no longer open keeps its Tab and shows Not found, as that page decides.

## Settings overlay

In the Desktop app, Settings opens over the page the User is on instead of as pages (`SettingsOverlay`, design "Nimbus Desktop v2" 2c). The browser keeps the Settings overview and its pages.

- **Opening.** Settings at the bottom of the Sidebar, or Ctrl `,` (⌘ `,` on macOS) from anywhere, opens it on Profile.
- **Inside.** A panel centred in the window over the dimmed, blurred app, laid out like the Claude app's Settings: a header row ("Settings" and the ✕) over two columns, each scrolling on its own. On the left the Settings pages, Account (Profile, Security, Appearance) for everyone and Workspace (Roles & access, Audit log) only for Users who may open them, from the same `settingsGroups` as the overview; on the right the open page. A page's breadcrumbs start inside the overlay (`overlayCrumbs`): a page the list opens has none, a Role starts at Roles & access.
- **Closing.** Esc, the ✕ or a click on the dimmed app goes back to the page behind, the way Back does: back through the history entries Settings added, so Back afterwards doesn't open Settings again. A Settings address opened directly is replaced by the page behind. Esc closes Settings only when pressed inside it and not in a text field, so a page's own dialog or menu, drawn outside the panel, gets its Esc first. While Settings is open, Ctrl `,` does nothing, so the page open in it stays.
- **Addresses.** The overlay is how the Desktop app shows any `/settings/...` address (`isSettingsPath`) once the User is signed in and verified (not while a new email is being confirmed), so links, Back and a restored page keep working. `AppRoutes` keeps the page behind: the last signed-in address that wasn't Settings, for that User (never a signed-out page such as Login or Session expired), or Home for a Settings address opened directly. `/settings` itself opens Profile, and `/settings/password` Profile's password window.
- **Tabs.** A Settings address is never a Tab of its own; Tabs hold the pages behind the overlay. While Settings is open, the Tab shortcuts do nothing.
- **Window.** The overlay is drawn after the window's drag areas and opts out of them, so its controls take clicks at the 800×560 minimum size too. Its chunk loads on first use; if it can't load, Settings shows as pages in the shell instead, so it stays reachable.

## Shortcuts

| Shortcut                         | Does                       |
| -------------------------------- | -------------------------- |
| Ctrl `\` (⌘ `\` on macOS)        | Folds or opens the Sidebar |
| Ctrl `,` (⌘ `,` on macOS)        | Opens Settings             |
| Ctrl W (⌘ W on macOS)            | Closes the selected Tab    |
| Ctrl Tab, Ctrl Shift Tab         | Next, previous Tab         |
| Ctrl Shift W (Windows, Linux)    | Closes the window          |
| Ctrl `+`, Ctrl `-`, Ctrl `0` (⌘) | Zoom in, out, actual size  |
| F11 (Ctrl ⌘ F on macOS)          | Full screen                |
| Ctrl R, Ctrl Shift I (`--dev`)   | Reload, developer tools    |

## Tests

`pnpm --filter desktop test` runs plain Node tests (`node --test`) for reading `NIMBUS_URL`, which navigations the window allows, which pages may call main, and the window's frame and menu, without starting Electron. The Sidebar and the Tabs are tested in the web app (`DesktopShell.test.tsx`, `Tabs.test.tsx`) with `window.nimbusDesktop` faked.
