import * as SecureStore from "expo-secure-store";
import type { RememberedDevices, TokenStore } from "./client";

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

const PENDING_SIGN_IN = "nimbus.pendingSignIn";
const REMEMBERED_DEVICES = "nimbus.rememberedDevices";

/** The pending Two-step sign-in, from a right password until its code is right (5 minutes at most on the server). */
export const pendingSignInStore: TokenStore = {
  get: () => SecureStore.getItemAsync(PENDING_SIGN_IN),
  set: (token) => SecureStore.setItemAsync(PENDING_SIGN_IN, token),
  clear: () => SecureStore.deleteItemAsync(PENDING_SIGN_IN),
};

/**
 * "Remember this device for 30 days", for each User who ticked it on this phone: their remembered token by email,
 * lower-cased, so another User signing in here is still asked for their code. One entry, as JSON, because a secure
 * storage key can't hold an email's characters.
 */
export const rememberedDevices: RememberedDevices = {
  get: async (email) => (await readRemembered())[email.trim().toLowerCase()] ?? null,
  set: async (email, token) => {
    const all = await readRemembered();
    all[email.trim().toLowerCase()] = token;
    await SecureStore.setItemAsync(REMEMBERED_DEVICES, JSON.stringify(all));
  },
  forget: async (email) => {
    const all = await readRemembered();
    delete all[email.trim().toLowerCase()];
    await SecureStore.setItemAsync(REMEMBERED_DEVICES, JSON.stringify(all));
  },
};

async function readRemembered(): Promise<Record<string, string>> {
  try {
    const stored = JSON.parse((await SecureStore.getItemAsync(REMEMBERED_DEVICES)) ?? "{}");
    return typeof stored === "object" && stored !== null ? stored : {};
  } catch {
    return {};
  }
}
