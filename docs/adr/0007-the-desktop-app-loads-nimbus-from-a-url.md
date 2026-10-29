# The Desktop app loads Nimbus from a URL

The Desktop app is a window around the website, and it loads it from an address (`NIMBUS_URL`, default `http://localhost:3000`, the dev server) instead of carrying its own copy of the built files. Today that address is the dev server each developer already runs; once Nimbus is hosted it is the hosted site, with no change to the app. Because the page then lives on the same site as the API, everything works as in a browser: relative `/api` calls, the `SameSite=Strict` refresh cookie, and Google and GitHub sign-in, whose providers redirect back to the server's `PUBLIC_URL`.

- **The shell stays small.** The window may navigate within Nimbus's origin and within the site it is currently on, so a provider's own sign-in form works; hopping from one site to another is blocked, and links that ask for a new window open in the default browser. Context isolation and the sandbox are on, and the preload script gives the page only `window.nimbusDesktop`.
- **No packaged copy of the web app until there is a reason.** A copy of the built files would need its own way to reach the API and to keep the refresh cookie (the page would be on another site), and provider sign-in could not finish in it. Nobody can use such a copy without a running server anyway, because there is no hosted API yet.

## Considered Options

- **Bundle the built web app and forward `/api` from the main process, with its own cookie jar.** We built this first (it worked, in tests and in real Electron), then dropped it: about 400 lines of cookie and proxy code that a hosted site makes unnecessary, and with Google and GitHub sign-in left out of the packaged app.
- **Bundle the web app, call the API's real address, and use tokens in the OS keychain instead of cookies.** The usual choice for a local UI, but it changes how the API issues and accepts refresh tokens for every client. Revisit if the Desktop app ever has to work without loading the site.
- **Sign in with Google or GitHub through the system browser** (a `nimbus://` link or a local port back to the app, RFC 8252). What Notion, Slack and Linear do, and what Google expects, because it can refuse sign-in in an embedded window. At first the provider's page opened in the window, which works for GitHub and may for Google; since #185 the browser does it, handing back through a localhost port (ADR 0008).
