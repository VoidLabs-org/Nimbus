import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookieJar } from "./cookie-jar.js";
import { createApiProxy, parseApiUrl } from "./api-proxy.js";

const REFRESH =
  "refresh_token=abc; Max-Age=7776000; Path=/api/auth; Secure; HttpOnly; SameSite=Strict";

/** A fake API: answers each call with the next response and remembers what it was asked. */
function fakeApi(...answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init, headers: new Headers(init.headers) });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  };
  return { fetch, calls };
}

function reply(body, { status = 200, headers = {}, setCookies = [] } = {}) {
  const responseHeaders = new Headers(headers);
  for (const cookie of setCookies) responseHeaders.append("set-cookie", cookie);
  return new Response(status === 204 || status === 302 ? null : body, {
    status,
    headers: responseHeaders,
  });
}

function proxy(api, { apiUrl = "http://localhost:8080", jar = new CookieJar(), onChange } = {}) {
  return createApiProxy({ apiUrl: new URL(apiUrl), jar, fetch: api.fetch, onChange });
}

const page = (path, init) => new Request(`app://nimbus${path}`, init);

describe("createApiProxy", () => {
  it("sends the request to the API with its method, path, query and body", async () => {
    const api = fakeApi(reply('{"ok":true}', { headers: { "content-type": "application/json" } }));

    const response = await proxy(api)(
      page("/api/auth/login?x=1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "nimbus",
          authorization: "Bearer t",
        },
        body: '{"email":"a@b.c"}',
      }),
    );

    assert.equal(api.calls.length, 1);
    assert.equal(api.calls[0].url, "http://localhost:8080/api/auth/login?x=1");
    assert.equal(api.calls[0].init.method, "POST");
    assert.equal(api.calls[0].headers.get("x-requested-with"), "nimbus");
    assert.equal(api.calls[0].headers.get("authorization"), "Bearer t");
    assert.equal(await new Response(api.calls[0].init.body).text(), '{"email":"a@b.c"}');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it("sends no body with a GET", async () => {
    const api = fakeApi(reply("[]"));

    await proxy(api)(page("/api/users/me"));

    assert.equal(api.calls[0].init.body, undefined);
  });

  it("leaves out what only the page's own origin would add", async () => {
    const api = fakeApi(reply("{}"));

    await proxy(api)(
      page("/api/users/me", {
        headers: {
          origin: "app://nimbus",
          referer: "app://nimbus/",
          cookie: "evil=1",
          host: "nimbus",
        },
      }),
    );

    for (const name of ["origin", "referer", "cookie", "host"]) {
      assert.equal(api.calls[0].headers.get(name), null, name);
    }
  });

  it("keeps the API's cookie, sends it back where its Path says, and never shows it to the page", async () => {
    const api = fakeApi(reply("{}", { setCookies: [REFRESH] }), reply("{}"), reply("{}"));
    const handle = proxy(api);

    const login = await handle(page("/api/auth/login", { method: "POST", body: "{}" }));
    await handle(
      page("/api/auth/refresh", { method: "POST", headers: { "x-requested-with": "nimbus" } }),
    );
    await handle(page("/api/users/me"));

    assert.equal(login.headers.get("set-cookie"), null);
    assert.equal(api.calls[0].headers.get("cookie"), null);
    assert.equal(api.calls[1].headers.get("cookie"), "refresh_token=abc");
    assert.equal(api.calls[2].headers.get("cookie"), null);
  });

  it("forgets the cookie when the API ends it on sign-out", async () => {
    const api = fakeApi(
      reply("{}", { setCookies: [REFRESH] }),
      reply(null, {
        status: 204,
        setCookies: ["refresh_token=; Max-Age=0; Path=/api/auth; Secure; HttpOnly"],
      }),
      reply("{}"),
    );
    const handle = proxy(api);

    await handle(page("/api/auth/login", { method: "POST", body: "{}" }));
    await handle(page("/api/auth/logout", { method: "POST" }));
    await handle(page("/api/auth/refresh", { method: "POST" }));

    assert.equal(api.calls[2].headers.get("cookie"), null);
  });

  it("sends a Secure cookie to localhost over http, but not to another host over http", async () => {
    for (const [apiUrl, expected] of [
      ["http://localhost:8080", "refresh_token=abc"],
      ["http://127.0.0.1:8080", "refresh_token=abc"],
      ["https://api.nimbus.example", "refresh_token=abc"],
      ["http://api.nimbus.example", null],
    ]) {
      const api = fakeApi(reply("{}", { setCookies: [REFRESH] }), reply("{}"));
      const handle = proxy(api, { apiUrl });

      await handle(page("/api/auth/login", { method: "POST", body: "{}" }));
      await handle(page("/api/auth/refresh", { method: "POST" }));

      assert.equal(api.calls[1].headers.get("cookie"), expected, apiUrl);
    }
  });

  it("tells when the cookies changed, so they can be saved", async () => {
    let changes = 0;
    const api = fakeApi(reply("{}", { setCookies: [REFRESH] }), reply("{}"));
    const handle = proxy(api, { onChange: () => changes++ });

    await handle(page("/api/auth/login", { method: "POST", body: "{}" }));
    await handle(page("/api/users/me"));

    assert.equal(changes, 1);
  });

  it("passes a redirect on without following it, pointing it back at the app", async () => {
    const api = fakeApi(
      reply(null, {
        status: 302,
        headers: { location: "http://localhost:8080/api/somewhere?a=1" },
      }),
    );

    const response = await proxy(api)(page("/api/old"));

    assert.equal(api.calls[0].init.redirect, "manual");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "app://nimbus/api/somewhere?a=1");
  });

  it("leaves a redirect to another site alone", async () => {
    const api = fakeApi(
      reply(null, { status: 302, headers: { location: "https://accounts.google.com/o/oauth2" } }),
    );

    const response = await proxy(api)(page("/api/auth/oauth2/google"));

    assert.equal(response.headers.get("location"), "https://accounts.google.com/o/oauth2");
  });

  it("drops the encoding and length of a body fetch has already decoded", async () => {
    const api = fakeApi(
      reply("hello", { headers: { "content-encoding": "gzip", "content-length": "99" } }),
    );

    const response = await proxy(api)(page("/api/x"));

    assert.equal(response.headers.get("content-encoding"), null);
    assert.equal(response.headers.get("content-length"), null);
    assert.equal(await response.text(), "hello");
  });

  it("keeps the length of a picture it streams on", async () => {
    const api = fakeApi(
      reply("jpegbytes", { headers: { "content-type": "image/jpeg", "content-length": "9" } }),
    );

    const response = await proxy(api)(page("/api/profile-pictures/abc"));

    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("content-length"), "9");
  });

  it("answers 502 when the API can't be reached", async () => {
    const api = fakeApi(new TypeError("fetch failed"));

    const response = await proxy(api)(page("/api/users/me"));

    assert.equal(response.status, 502);
    assert.match(response.headers.get("content-type"), /application\/problem\+json/);
    assert.deepEqual(await response.json(), {
      type: "about:blank",
      title: "Bad Gateway",
      status: 502,
      detail:
        "The Nimbus server can't be reached. Check that it is running at http://localhost:8080.",
    });
  });

  it("answers an error status from the API as it is", async () => {
    const api = fakeApi(
      reply('{"status":401}', {
        status: 401,
        headers: { "content-type": "application/problem+json" },
      }),
    );

    const response = await proxy(api)(page("/api/users/me"));

    assert.equal(response.status, 401);
    assert.equal((await response.json()).status, 401);
  });

  it("only answers paths under /api", async () => {
    const api = fakeApi();

    for (const path of ["/", "/settings", "/apix", "/api-docs"]) {
      const response = await proxy(api)(page(path));
      assert.equal(response, null, path);
    }
    assert.equal(api.calls.length, 0);
  });
});

describe("parseApiUrl", () => {
  it("defaults to the local API", () => {
    assert.equal(parseApiUrl(undefined).href, "http://localhost:8080/");
    assert.equal(parseApiUrl("  ").href, "http://localhost:8080/");
  });

  it("takes an http or https address", () => {
    assert.equal(parseApiUrl("https://api.nimbus.example").origin, "https://api.nimbus.example");
    assert.equal(parseApiUrl(" http://10.0.0.5:9000/ ").origin, "http://10.0.0.5:9000");
  });

  it("refuses anything else, saying what to fix", () => {
    for (const value of ["nimbus", "ftp://x.example", "file:///etc", "http://"]) {
      assert.throws(() => parseApiUrl(value), /NIMBUS_API_URL/, value);
    }
  });
});
