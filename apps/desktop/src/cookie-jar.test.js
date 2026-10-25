import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookieJar } from "./cookie-jar.js";

const NOW = Date.parse("2026-10-25T10:00:00Z");

// What the API sets on sign-in (AuthController.refreshCookie).
const REFRESH =
  "refresh_token=abc; Max-Age=7776000; Expires=Sat, 23 Jan 2027 10:00:00 GMT; Path=/api/auth; Secure; HttpOnly; SameSite=Strict";

describe("CookieJar", () => {
  it("sends a stored cookie to the paths under its Path, and no others", () => {
    const jar = new CookieJar();
    jar.store([REFRESH], "/api/auth/login", NOW);

    assert.equal(jar.header("/api/auth/refresh", { secure: true, now: NOW }), "refresh_token=abc");
    assert.equal(jar.header("/api/auth", { secure: true, now: NOW }), "refresh_token=abc");
    assert.equal(jar.header("/api/users/me", { secure: true, now: NOW }), null);
    // A path that only starts with the same letters is another path.
    assert.equal(jar.header("/api/authors", { secure: true, now: NOW }), null);
  });

  it("holds back a Secure cookie unless the connection is safe", () => {
    const jar = new CookieJar();
    jar.store([REFRESH], "/api/auth/login", NOW);

    assert.equal(jar.header("/api/auth/refresh", { secure: false, now: NOW }), null);
  });

  it("sends a cookie without Secure on any connection", () => {
    const jar = new CookieJar();
    jar.store(
      ["two_step_pending=xyz; Max-Age=300; Path=/api/auth; HttpOnly"],
      "/api/auth/login",
      NOW,
    );

    assert.equal(
      jar.header("/api/auth/two-step", { secure: false, now: NOW }),
      "two_step_pending=xyz",
    );
  });

  it("replaces a cookie of the same name and path, and keeps those on another path apart", () => {
    const jar = new CookieJar();
    jar.store(["a=1; Path=/api/auth", "a=top; Path=/"], "/api/auth/login", NOW);
    jar.store(["a=2; Path=/api/auth"], "/api/auth/login", NOW);

    // The longer path comes first, as browsers send them.
    assert.equal(jar.header("/api/auth/refresh", { secure: true, now: NOW }), "a=2; a=top");
  });

  it("forgets a cookie the server expires with Max-Age=0", () => {
    const jar = new CookieJar();
    jar.store([REFRESH], "/api/auth/login", NOW);

    jar.store(
      ["refresh_token=; Max-Age=0; Path=/api/auth; Secure; HttpOnly; SameSite=Strict"],
      "/api/auth/logout",
      NOW,
    );

    assert.equal(jar.header("/api/auth/refresh", { secure: true, now: NOW }), null);
  });

  it("stops sending a cookie once it has expired, and prefers Max-Age to Expires", () => {
    const jar = new CookieJar();
    jar.store(["a=1; Max-Age=60; Expires=Sat, 23 Jan 2027 10:00:00 GMT; Path=/"], "/x", NOW);

    assert.equal(jar.header("/x", { secure: true, now: NOW + 59_000 }), "a=1");
    assert.equal(jar.header("/x", { secure: true, now: NOW + 61_000 }), null);
  });

  it("uses Expires when there is no Max-Age", () => {
    const jar = new CookieJar();
    jar.store(["a=1; Expires=Sun, 25 Oct 2026 11:00:00 GMT; Path=/"], "/x", NOW);

    assert.equal(jar.header("/x", { secure: true, now: NOW + 3_000_000 }), "a=1");
    assert.equal(jar.header("/x", { secure: true, now: NOW + 3_700_000 }), null);
  });

  it("defaults the Path to the directory of the request, like a browser", () => {
    const jar = new CookieJar();
    jar.store(["a=1"], "/api/auth/login", NOW);

    assert.equal(jar.header("/api/auth/refresh", { secure: true, now: NOW }), "a=1");
    assert.equal(jar.header("/api/users", { secure: true, now: NOW }), null);
  });

  it("ignores a Set-Cookie it can't read", () => {
    const jar = new CookieJar();
    jar.store(["", "no-equals-sign", "=novalue; Path=/"], "/x", NOW);

    assert.equal(jar.header("/x", { secure: true, now: NOW }), null);
  });

  it("keeps a value that contains an equals sign", () => {
    const jar = new CookieJar();
    jar.store(["token=a=b==; Path=/"], "/x", NOW);

    assert.equal(jar.header("/x", { secure: true, now: NOW }), "token=a=b==");
  });

  it("tells whether a Set-Cookie changed what it holds", () => {
    const jar = new CookieJar();

    assert.equal(jar.store([REFRESH], "/api/auth/login", NOW), true);
    assert.equal(jar.store([], "/api/auth/login", NOW), false);
  });

  it("saves only cookies that last, and loads them back", () => {
    const jar = new CookieJar();
    jar.store(
      [REFRESH, "session_only=1; Path=/", "old=1; Max-Age=10; Path=/"],
      "/api/auth/login",
      NOW,
    );

    const loaded = CookieJar.fromJSON(
      JSON.parse(JSON.stringify(jar.toJSON(NOW + 20_000))),
      NOW + 20_000,
    );

    assert.equal(
      loaded.header("/api/auth/refresh", { secure: true, now: NOW + 20_000 }),
      "refresh_token=abc",
    );
    assert.equal(loaded.header("/", { secure: true, now: NOW + 20_000 }), null);
  });

  it("loads nothing from data it doesn't understand", () => {
    for (const data of [null, undefined, "x", 3, {}, [{ name: 1 }], [null]]) {
      assert.equal(CookieJar.fromJSON(data, NOW).header("/", { secure: true, now: NOW }), null);
    }
  });

  it("empties itself", () => {
    const jar = new CookieJar();
    jar.store([REFRESH], "/api/auth/login", NOW);

    jar.clear();

    assert.equal(jar.header("/api/auth/refresh", { secure: true, now: NOW }), null);
  });
});
