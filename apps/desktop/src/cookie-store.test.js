import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CookieJar } from "./cookie-jar.js";
import { createCookieStore } from "./cookie-store.js";

const NOW = Date.parse("2026-10-25T10:00:00Z");
const REFRESH = "refresh_token=abc; Max-Age=7776000; Path=/api/auth; Secure; HttpOnly";

/** Not real encryption: enough to tell the file isn't the plain text. */
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text, "utf8").reverse(),
  decryptString: (buffer) => Buffer.from(buffer).reverse().toString("utf8"),
};

let dir;
let file;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nimbus-cookies-"));
  file = path.join(dir, "api-cookies.bin");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function jarWithRefresh() {
  const jar = new CookieJar();
  jar.store([REFRESH], "/api/auth/login", NOW);
  return jar;
}

describe("createCookieStore", () => {
  it("saves the jar encrypted and loads it back", async () => {
    const store = createCookieStore({ file, safeStorage });

    await store.save(jarWithRefresh());
    const loaded = await store.load(NOW);

    assert.equal(
      loaded.header("/api/auth/refresh", { secure: true, now: NOW }),
      "refresh_token=abc",
    );
    assert.equal((await readFile(file)).includes("refresh_token"), false);
  });

  it("starts empty when nothing was saved yet", async () => {
    const loaded = await createCookieStore({ file, safeStorage }).load(NOW);

    assert.equal(loaded.header("/api/auth/refresh", { secure: true, now: NOW }), null);
  });

  it("starts empty, and doesn't fail, when the file is damaged or can't be decrypted", async () => {
    await writeFile(file, "not what we wrote");
    const unreadable = {
      ...safeStorage,
      decryptString: () => {
        throw new Error("bad key");
      },
    };

    for (const storage of [safeStorage, unreadable]) {
      const loaded = await createCookieStore({ file, safeStorage: storage }).load(NOW);
      assert.equal(loaded.header("/api/auth/refresh", { secure: true, now: NOW }), null);
    }
  });

  it("keeps nothing on disk when the system can't encrypt, so a sign-in lasts only this run", async () => {
    const store = createCookieStore({
      file,
      safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
    });

    await store.save(jarWithRefresh());

    await assert.rejects(readFile(file), { code: "ENOENT" });
    assert.equal(
      (await store.load(NOW)).header("/api/auth/refresh", { secure: true, now: NOW }),
      null,
    );
  });

  it("removes the file once there is nothing left to keep", async () => {
    const store = createCookieStore({ file, safeStorage });
    await store.save(jarWithRefresh());

    await store.save(new CookieJar());

    await assert.rejects(readFile(file), { code: "ENOENT" });
  });

  it("saves one change at a time, the last one winning", async () => {
    const store = createCookieStore({ file, safeStorage });
    const first = jarWithRefresh();
    const second = new CookieJar();
    second.store(["other=1; Max-Age=3600; Path=/"], "/x", NOW);

    await Promise.all([store.save(first), store.save(second)]);

    const loaded = await store.load(NOW);
    assert.equal(loaded.header("/", { secure: true, now: NOW }), "other=1");
    assert.equal(loaded.header("/api/auth/refresh", { secure: true, now: NOW }), "other=1");
  });
});
