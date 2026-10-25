// Keeps the jar between runs, so "stay signed in" survives restarting the app. The refresh cookie is as good as a
// password for 90 days, so it is only written encrypted with the system's key store (DPAPI, Keychain, libsecret).
// Where there is none, nothing is written and the User signs in again each run.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { CookieJar } from "./cookie-jar.js";

/**
 * @param {object} options
 * @param {string} options.file where to keep it
 * @param {{ isEncryptionAvailable(): boolean, encryptString(text: string): Buffer, decryptString(data: Buffer): string }} options.safeStorage
 */
export function createCookieStore({ file, safeStorage }) {
  // Saves go one after the other, so two changes in a row can't interleave their writes.
  let queue = Promise.resolve();

  return {
    /** @returns {Promise<CookieJar>} what was saved, or an empty jar when there is nothing usable */
    async load(now = Date.now()) {
      if (!safeStorage.isEncryptionAvailable()) return new CookieJar();
      try {
        const text = safeStorage.decryptString(await readFile(file));
        return CookieJar.fromJSON(JSON.parse(text), now);
      } catch {
        // Missing, damaged, or from another computer or account: the User signs in again.
        return new CookieJar();
      }
    },

    /** @param {CookieJar} jar */
    save(jar) {
      const data = JSON.stringify(jar.toJSON());
      const done = queue.then(() => write(file, data, safeStorage));
      // A failed save must not stop the ones after it.
      queue = done.catch(() => {});
      return done;
    },
  };
}

async function write(file, data, safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) return;
  if (data === "[]") {
    await rm(file, { force: true });
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  // Whole file or nothing, so a crash mid-write can't leave half a jar.
  const temporary = `${file}.tmp`;
  await writeFile(temporary, safeStorage.encryptString(data), { mode: 0o600 });
  await rename(temporary, file);
}
