/**
 * Where the Nimbus API is. Until an API is hosted this is a developer's own (README: `adb reverse` makes the computer's
 * `localhost` reachable from an Android emulator or a phone on USB). Set `EXPO_PUBLIC_NIMBUS_API_URL` to change it.
 */
export const apiUrl = (process.env.EXPO_PUBLIC_NIMBUS_API_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
