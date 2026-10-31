import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "./client";

const REFRESH_TOKEN = "nimbus.refreshToken";
const WELCOMED = "nimbus.welcomed";

/** The refresh token, in the iOS Keychain or Android Keystore; readable only by this app, and only on this phone. */
export const refreshTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(REFRESH_TOKEN),
  set: (token) => SecureStore.setItemAsync(REFRESH_TOKEN, token),
  clear: () => SecureStore.deleteItemAsync(REFRESH_TOKEN),
};

/** Whether this phone has seen the first-launch Welcome screen; after that the app opens on Sign in. */
export const welcomeSeen = {
  get: async () => (await SecureStore.getItemAsync(WELCOMED)) === "yes",
  set: () => SecureStore.setItemAsync(WELCOMED, "yes"),
};
