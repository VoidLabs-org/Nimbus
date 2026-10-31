# The Mobile app is React Native with Expo

The Mobile app is built with React Native and Expo, in this repository as `apps/mobile`, rather than with Kotlin Multiplatform and Compose. The team of three writes TypeScript everywhere else, so React Native lets anyone work on it and shares theme values, API types and request helpers with the web app through workspace packages. Expo also builds and signs the iOS app in the cloud, which matters because nobody develops on a Mac. Its components are rebuilt for phones; the web app's Mantine components in `packages/ui` render HTML and can't be reused.

## Considered Options

- **Kotlin Multiplatform with Compose Multiplatform.** Fully native on Android, compiled code with no JavaScript runtime, and one shared UI for Android and iOS. Rejected because it shares nothing with the web app, needs a Mac for every iOS build, and leaves mobile to whoever knows Kotlin. Its speed was not a reason on its own: dragging cards between columns runs on the UI thread in React Native too (Gesture Handler and Reanimated), and the slow part of Nimbus is the round trip to the API.
- **Wrapping the web app (Capacitor or a PWA)**, as the Desktop app wraps it. Cheapest, but it feels like a website on a phone, and the Mobile app is meant to feel like a phone app.
