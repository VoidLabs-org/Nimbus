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
 * "Remember this device for 30 days", for each User who ticked it on this phone: their remembered token and User id by
 * email, lower-cased, so another User signing in here is still asked for their code. One entry, as JSON, because a
 * secure storage key can't hold an email's characters. Each change reads and rewrites that entry, so changes run one
 * after another: two at once would each start from the old entry, and one would undo the other. At most
 * {@link MAX_REMEMBERED} are kept, the latest, which is as many as a provider sign-in may send.
 */
export const rememberedDevices: RememberedDevices = {
  get: async (email) => {
    await changes;
    return (await readRemembered())[key(email)]?.token ?? null;
  },
  set: (email, userId, token) =>
    change((all) => {
      // The User's entry under an earlier email (before they changed it) is of no use any more.
      for (const [other, entry] of Object.entries(all)) {
        if (entry.userId === userId) delete all[other];
      }
      all[key(email)] = { userId, token };
      // Oldest first, as the entries were added: the ones over the limit go.
      for (const oldest of Object.keys(all).slice(0, -MAX_REMEMBERED)) delete all[oldest];
    }),
  forget: (email) =>
    change((all) => {
      delete all[key(email)];
    }),
  forgetUser: (userId) =>
    change((all) => {
      for (const [email, entry] of Object.entries(all)) {
        if (entry.userId === userId) delete all[email];
      }
    }),
  all: async () => {
    await changes;
    return Object.values(await readRemembered())
      .map((entry) => entry.token)
      .slice(-MAX_REMEMBERED);
  },
};

type Remembered = Record<string, { userId: string; token: string }>;

/** As many remembered devices as the API's app sign-in takes at once (`rememberedTokens`, at most 20). */
const MAX_REMEMBERED = 20;

let changes: Promise<unknown> = Promise.resolve();

function change(edit: (all: Remembered) => void): Promise<void> {
  const next = changes.then(async () => {
    const all = await readRemembered();
    edit(all);
    await SecureStore.setItemAsync(REMEMBERED_DEVICES, JSON.stringify(all));
  });
  // A failed change doesn't stop the ones after it.
  changes = next.catch(() => {});
  return next;
}

function key(email: string) {
  return email.trim().toLowerCase();
}

async function readRemembered(): Promise<Remembered> {
  try {
    const stored: unknown = JSON.parse(
      (await SecureStore.getItemAsync(REMEMBERED_DEVICES)) ?? "{}",
    );
    return typeof stored === "object" && stored !== null ? (stored as Remembered) : {};
  } catch {
    return {};
  }
}
