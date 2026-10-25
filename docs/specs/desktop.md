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
- **Security.** `contextIsolation` and `sandbox` are on. The page gets only `window.nimbusDesktop` from the preload script (`src/preload.cjs`), currently `{ platform }` (`darwin`, `win32` or `linux`). The web app treats its presence as "this is the Desktop app".

## Tests

`pnpm --filter desktop test` runs plain Node tests (`node --test`) for reading `NIMBUS_URL` and for which navigations the window allows, without starting Electron.
