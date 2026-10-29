# Desktop provider sign-in returns through a localhost port

In the Desktop app, "Continue with Google" and "Continue with GitHub" (and Connect on Security) open the system browser, because Google can refuse sign-in in an embedded window and only the browser has the User's saved logins and passkeys (RFC 8252). The browser hands the result back to the app through a port on `127.0.0.1` that the app opens for that one attempt, not through a `nimbus://` link. Until Nimbus is hosted there is no installer, so everyone runs the app unpackaged, and an unpackaged app can't register its own link scheme everywhere: macOS needs the scheme in a packaged app's Info.plist, and Linux needs a `.desktop` file installed by hand. A localhost port needs nothing registered, works on all three systems, and the app is running by definition. `nimbus://` comes with the installer (and with Notifications, which want links anyway); only the return address changes then.

- **The provider still returns to the API at `PUBLIC_URL`**, so Google's and GitHub's registered redirect addresses don't change. Only the API's last redirect goes to the localhost port, and it carries a one-time code, never a token.
- **The app finishes the sign-in, not the browser.** The code is bound to a secret the app made (the verifier; the API saw only its hash), so a program that sees the code can't use it. The page in the app trades code and verifier for the sign-in, so Two-step, the remembered-browser cookie, the refresh cookie and the Session's device label are the app's, not the browser's.

## Considered Options

- **A `nimbus://` link.** What Slack, Notion, Linear and Figma do, and nicer: the browser asks "Open Nimbus?" and the localhost address never shows. Not possible on macOS without a packaged build; planned for when there is one.
- **Keep the provider's page in the app window.** Works for GitHub, and for Google only until it refuses; none of the User's saved logins, passkeys or security keys.
