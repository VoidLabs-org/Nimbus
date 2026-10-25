# desktop

The Electron app (`apps/desktop`): a window around the web app (`apps/web`). It is not a backend module, so there is no public interface or events here; this describes how it works now. Features of the Desktop app are planned in #177; this file grows with each ticket.

## Two ways to load the web app

| Command                                 | Loads                                             | `/api` is answered by                                        |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev:desktop` (`electron . --dev`) | the Vite dev server, `http://localhost:3000`      | Vite's proxy to Spring Boot on 8080 (as in a browser)        |
| `pnpm start:desktop` (packaged)         | the built app, `apps/web/dist`, as `app://nimbus` | the main process, which forwards to `NIMBUS_API_URL` (below) |

`pnpm start:desktop` builds the web app and then runs the packaged one (`pnpm --filter desktop start` alone skips the build). The API must already be running. `pnpm dev:desktop` is the one to use while developing.

## The packaged app and the API (ADR 0007)

- `src/main.js` registers `app://` as a standard, secure scheme and serves it. A request whose path is `/api` or under `/api/` goes to `src/api-proxy.js`; any other path is a file from `apps/web/dist` (`src/static-files.js`), and a path with no file extension (a page route) is `index.html`, so the app's own router takes over. A path that climbs out of `dist` is `400`.
- **`NIMBUS_API_URL`** is read when the app starts (default `http://localhost:8080`, no trailing slash needed). It must be an `http` or `https` address; anything else shows an error box naming the variable and quits. There is no setting inside the app. It is ignored in `--dev`. Use `https` for anything but this computer: a `Secure` cookie is not sent over plain `http` to another host, so sign-in would not stick.
- **Forwarding.** Method, path, query, body (streamed, so uploads work), and headers pass through. Left out: `Host`, `Origin`, `Referer`, `Cookie` and hop-by-hop headers, because they belong to the page's own origin. Redirects are not followed; a `Location` pointing at the API's own origin is rewritten to `app://nimbus`. The response's `Set-Cookie` and `Content-Encoding` are dropped (the body is already decoded). An API that can't be reached answers `502` as `application/problem+json`, which the web app shows as its usual server-error page.
- **Cookies.** `src/cookie-jar.js` keeps the API's cookies and sends them where their `Path` says, `Secure` ones only over https or to localhost. `src/cookie-store.js` saves the cookies that last (the refresh cookie) to `api-cookies.bin` in the user data folder, encrypted with `safeStorage`; without a system key store nothing is written. The file is rewritten after each change and removed when no cookie is left, so signing out also ends "stay signed in" after a restart.
- **Google and GitHub sign-in are left out of the packaged app.** `src/preload.cjs` exposes `window.nimbusDesktop = { packaged }` (true only for the packaged app, set by the `--nimbus-packaged` argument the main process passes), and the web app's `api.providers()` then returns none, so the buttons on Login and Register, and "Connect" on the Security page, don't show. A connected account can still be disconnected. See ADR 0007 for why.

## Security

`contextIsolation` and `sandbox` are on; the only thing the page gets from Electron is `window.nimbusDesktop`. Links to other sites open in the default browser, and the window never navigates away from the app's own origin. The refresh cookie never reaches the page's JavaScript.

## Tests

`pnpm --filter desktop test` runs plain Node tests (`node --test`) for the cookie jar, the cookie store, the `/api` forwarding and the file lookup, without starting Electron.
