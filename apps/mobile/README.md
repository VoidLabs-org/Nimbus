# Nimbus Mobile app

The Mobile app for Android and iOS: React Native with Expo and Expo Router ([ADR 0009](../../docs/adr/0009-the-mobile-app-is-react-native-with-expo.md)). How it works: [docs/specs/mobile.md](../../docs/specs/mobile.md).

It runs as an Expo **development build**, not in Expo Go: secure storage and the `nimbus://` scheme need the app's own build. There are no store releases until an API is hosted.

## First run (Android)

You need Android Studio with an emulator, or an Android phone with USB debugging. Pick an emulator image labelled **Google Play** or **Google APIs**, so Google sign-in works: it needs the Google Play services the other images lack.

```sh
pnpm install                      # from the repo root
pnpm dev:mobile                   # API (8080), web (3000) and Metro, in one terminal; leave it running
pnpm --filter mobile android      # in a second terminal: builds the development build and installs it
```

An emulator or phone has its own `localhost`, so `pnpm dev:mobile` forwards its ports 8080 (the API) and 3000 (the web app, where Google and GitHub hand back) to this computer with `adb reverse`. It checks every few seconds, so an emulator started later, restarted or replugged is covered too, and prints a line when it forwards. With the forwarding, the app, `PUBLIC_URL` and the Google and GitHub callbacks all use `localhost`. `adb` is found in the Android SDK (`ANDROID_HOME`, or Android Studio's default folder) or on the PATH; without it, run `adb reverse tcp:8080 tcp:8080` and `adb reverse tcp:3000 tcp:3000` yourself. `adb reverse --list` shows what is forwarded.

## Every day

```sh
pnpm dev:mobile                   # API, web and Metro together, for the development build already on the phone
```

In the terminal view, select Metro's pane to use its keys (`r` reloads the app, `j` opens the debugger).

Rebuild with `pnpm --filter mobile android` only after adding a package with native code, or changing `app.json`. The last one was `expo-image-picker` (#205, Profile picture, with its camera and photo permissions in `app.json`): a development build from before it needs that rebuild.

## Where the API is

`http://localhost:8080` by default. Set `EXPO_PUBLIC_NIMBUS_API_URL` (for example in `apps/mobile/.env.local`, which git ignores) to use another. A phone on Wi-Fi can use the computer's network address (`http://192.168.x.x:8080`), but then Google sign-in can't finish: Google refuses callbacks to private addresses. Password sign-in still works.

## iOS

The same code runs on iOS. Building it needs a Mac with Xcode (`pnpm --filter mobile ios`), or Expo's cloud builds (EAS). The iOS Simulator shares the Mac's `localhost`, so no `adb reverse` is needed there.

## Checks

```sh
pnpm --filter mobile test         # Jest: the whole app rendered with Expo Router's test renderer
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Tests render the real `src/app` routes with `fetch` stubbed and secure storage faked (`src/test-support.ts`, `jest.setup.ts`). Each test file's first test loads every screen (about 2 seconds here, several times that on a CI runner), so the timeout is 30 seconds (`testTimeout` in `package.json`), not Jest's 5. Keep test files out of `src/app`: every file there is a screen.
