# mobile

The Mobile app (`apps/mobile`): Nimbus for Android and iOS, built with React Native, Expo and Expo Router ([ADR 0009](../adr/0009-the-mobile-app-is-react-native-with-expo.md)). It is not a backend module, so there is no public interface or events here; this describes how it works now. Its features are planned in #198; this file grows with each ticket. How to run it: [apps/mobile/README.md](../../apps/mobile/README.md).

## What it holds now

Sign in with email and password, staying signed in between launches, Home, and Sign out. Inbox is a placeholder until #208 and Create an account until #202; Settings shows who is signed in and Sign out. Projects and Issues are on the web for now.

## Talking to the API

- **Address.** `EXPO_PUBLIC_NIMBUS_API_URL`, default `http://localhost:8080`. The app calls the API directly, with no proxy. In development an Android emulator or a phone on USB reaches the computer's `localhost` through `adb reverse` (README).
- **Credentials** ([ADR 0010](../adr/0010-the-mobile-app-gets-its-tokens-in-the-body.md)). Every request sends `X-Nimbus-Client: mobile`, so the API answers the refresh token in the body (`refreshToken`) and sets no cookie (see [identity.md](identity.md)). The refresh token lives in the phone's secure storage (`expo-secure-store`: the iOS Keychain or the Android Keystore), under `nimbus.refreshToken`; the access token lives only in memory. One refresh runs at a time, as on the web, because a used refresh token coming back ends the Session.
- **User-Agent** (`nimbusUserAgent`). `Nimbus/<version> (<phone>)`, with the version from `app.json`: `(Android 15)`, `(iPhone; iOS 18.1)` or `(iPad; iPadOS 18.1)`. The Sessions list names the Session "Nimbus for Android", "Nimbus for iPhone" or "Nimbus for iPad" (`DeviceLabels`).
- **Shared code.** Errors, the problem-detail parsing and the messages come from `@repo/api`, the User type from its generated contract types, and the theme from `@repo/tokens`. Server data goes through TanStack Query, as on the web ([ADR 0003](../adr/0003-tanstack-query-for-server-data.md)).

## The Session

`SessionProvider` (`src/session/session.tsx`) knows where the app stands, and the root layout shows only the screens that state allows (`Stack.Protected`, each redirecting to the state's own screen):

| State        | When                                                                             | Screen                                                                                                        |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| starting     | Launch: reading storage and renewing a stored Session                            | The splash screen stays up                                                                                    |
| signed out   | Nothing stored, after Sign out, or after "Sign in again"                         | Welcome on the first launch only (`nimbus.welcomed`), then Sign in                                            |
| signed in    | A right password, or a stored Session renewed                                    | The tabs: Home, Inbox, Settings                                                                               |
| expired      | The server refused the refresh token (`401`), at launch or while the app is open | "Your session expired." Sign in again returns to the screen the User was on                                   |
| offline      | Renewing at launch couldn't reach the server                                     | "You're offline." with Try again; still signed in                                                             |
| server error | Renewing at launch got any other failure (a `5xx`, a `429`)                      | "Something went wrong on our side" with Try again, and Sign out, which forgets the Session on this phone only |

- **Signing in.** Web's messages: "Invalid email or password." for a `401`, the wait for a `429`, field errors under their fields. Without a connection: "Can't reach Nimbus." A User with Two-step verification gets no Session and the message that it isn't in the app yet (#203 adds the code).
- **While open.** A request answered `401` renews the Session once and tries again. When renewing is refused too, the stored token is deleted, the cached server data is dropped and the app shows "Your session expired".
- **Signing out** (Settings, confirmed in a bottom sheet) ends the Session on the server with the stored token, then deletes it and drops the cached data. If the server can't be reached the User stays signed in and the sheet says so, as on the web.

## Look

Paper in light mode and Ink in dark, following the phone until Appearance (#209); Fog and Slate are web only. Poppins is bundled (`@expo-google-fonts/poppins`, loaded with `useFonts`); if it fails to load, the system font takes its place. The brand bars show on the first-launch Welcome screen and the status screens (design option 1d); Sign in is just the logo and the form. Confirmations are bottom sheets. The app icon and splash use `apps/web/public/nimbus-icon-*.png`; Android's adaptive icon still needs its own artwork with the safe-zone padding before a store release.

## Tests

`pnpm --filter mobile test`: Jest (`jest-expo`) with React Native Testing Library. Each test renders the real `src/app` routes with Expo Router's test renderer (`renderApp` in `src/test-support.ts`), with `fetch` answered by a fake API that records every request, and secure storage kept in memory (`jest.setup.ts`). Tests follow what a User does and check what is on screen, what was sent and what is stored.
