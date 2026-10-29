import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  browserSignIns,
  challengeOf,
  doneAddress,
  makeNonce,
  makeVerifier,
  readHandback,
  startAddress,
} from "./browser-sign-in.js";

const nimbus = new URL("http://localhost:3000/some/page");

describe("makeVerifier and challengeOf", () => {
  it("makes a fresh 43-character verifier each time, and its S256 challenge", () => {
    const verifier = makeVerifier();
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(makeVerifier(), verifier);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(challengeOf(verifier), expected);
    assert.match(challengeOf(verifier), /^[A-Za-z0-9_-]{43}$/);
  });

  it("makes a nonce the API accepts", () => {
    assert.match(makeNonce(), /^[A-Za-z0-9_-]{16,64}$/);
  });
});

describe("startAddress", () => {
  const attempt = { challenge: "c".repeat(43), port: 53682, nonce: "n".repeat(24) };

  it("starts at the API on Nimbus's own origin with where to hand back", () => {
    const url = new URL(startAddress(nimbus, { ...attempt, provider: "google" }));
    assert.equal(url.origin, "http://localhost:3000");
    assert.equal(url.pathname, "/api/auth/oauth2/google");
    assert.equal(url.searchParams.get("desktop"), attempt.challenge);
    assert.equal(url.searchParams.get("port"), "53682");
    assert.equal(url.searchParams.get("nonce"), attempt.nonce);
    assert.equal(url.searchParams.has("link"), false);
  });

  it("carries a connect's link ticket", () => {
    const url = new URL(
      startAddress(nimbus, { ...attempt, provider: "github", linkTicket: "t&x=1" }),
    );
    assert.equal(url.searchParams.get("link"), "t&x=1");
  });

  it("refuses a provider or ticket that isn't one, so no other address opens", () => {
    for (const provider of ["", "../../evil", "https://evil.example", "Google", 7, undefined]) {
      assert.throws(
        () => startAddress(nimbus, { ...attempt, provider }),
        /provider/,
        String(provider),
      );
    }
    for (const linkTicket of ["", "x".repeat(257), 5]) {
      assert.throws(
        () => startAddress(nimbus, { ...attempt, provider: "google", linkTicket }),
        /link ticket/,
      );
    }
  });
});

describe("readHandback", () => {
  const nonce = "abcdefghijklmnopqrstuvwx";

  it("reads the code", () => {
    assert.deepEqual(readHandback("GET", `/${nonce}?code=xyz`, nonce), { code: "xyz" });
  });

  it("reads an error and its provider, and calls a bare return a failure", () => {
    assert.deepEqual(readHandback("GET", `/${nonce}?error=cancelled&provider=github`, nonce), {
      error: "cancelled",
      provider: "github",
    });
    assert.deepEqual(readHandback("GET", `/${nonce}`, nonce), { error: "failed", provider: null });
  });

  it("ignores anything that isn't the attempt's", () => {
    assert.equal(readHandback("GET", "/favicon.ico", nonce), null);
    assert.equal(readHandback("GET", `/${nonce}x?code=1`, nonce), null);
    assert.equal(readHandback("POST", `/${nonce}?code=1`, nonce), null);
    assert.equal(readHandback("GET", undefined, nonce), null);
  });
});

describe("doneAddress", () => {
  it("is the web app's done page, marked when nothing came back", () => {
    assert.equal(
      doneAddress(nimbus, true, "google"),
      "http://localhost:3000/auth/desktop-done?provider=google",
    );
    assert.equal(
      doneAddress(nimbus, false, "github"),
      "http://localhost:3000/auth/desktop-done?provider=github&failed=1",
    );
  });
});

/** Starts a sign-in whose "browser" only records what it was asked to open. */
function started(request = { provider: "google" }) {
  const opened = [];
  let handedBack = 0;
  const signIns = browserSignIns({
    nimbusUrl: nimbus,
    openExternal: (address) => opened.push(address),
    onHandback: () => handedBack++,
  });
  const result = signIns.start(request);
  return { signIns, result, opened, handedBack: () => handedBack };
}

/** Where the attempt's port is, from the address the browser was given. */
async function portOf(opened) {
  while (opened.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
  const url = new URL(opened[0]);
  return { port: url.searchParams.get("port"), nonce: url.searchParams.get("nonce"), url };
}

describe("browserSignIns", () => {
  it("hands the code and the verifier back, and sends the browser to the done page", async () => {
    const { result, opened, handedBack } = started();
    const { port, nonce, url } = await portOf(opened);

    const stray = await fetch(`http://127.0.0.1:${port}/elsewhere`, { redirect: "manual" });
    assert.equal(stray.status, 404);
    const response = await fetch(`http://127.0.0.1:${port}/${nonce}?code=the-code`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/auth/desktop-done?provider=google",
    );

    const outcome = await result;
    assert.equal(outcome.outcome, "code");
    assert.equal(outcome.code, "the-code");
    assert.equal(challengeOf(outcome.verifier), url.searchParams.get("desktop"));
    assert.equal(handedBack(), 1);
    // One request, then the port is closed.
    await assert.rejects(fetch(`http://127.0.0.1:${port}/${nonce}?code=again`));
  });

  it("hands an error back and sends the browser to the failed page", async () => {
    const { result, opened } = started({ provider: "github" });
    const { port, nonce } = await portOf(opened);

    const response = await fetch(
      `http://127.0.0.1:${port}/${nonce}?error=cancelled&provider=github`,
      { redirect: "manual" },
    );
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/auth/desktop-done?provider=github&failed=1",
    );
    assert.deepEqual(await result, { outcome: "error", error: "cancelled", provider: "github" });
  });

  it("opens the same address again, and Cancel closes the port", async () => {
    const { signIns, result, opened } = started();
    const { port } = await portOf(opened);

    signIns.reopen();
    assert.equal(opened.length, 2);
    assert.equal(opened[1], opened[0]);
    signIns.cancel();
    assert.deepEqual(await result, { outcome: "cancelled" });
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
    signIns.reopen();
    assert.equal(opened.length, 2, "nothing to open once it's over");
  });

  it("starting again cancels the attempt before", async () => {
    const opened = [];
    const signIns = browserSignIns({ nimbusUrl: nimbus, openExternal: (a) => opened.push(a) });
    const first = signIns.start({ provider: "google" });
    await portOf(opened);
    const second = signIns.start({ provider: "github" });

    assert.deepEqual(await first, { outcome: "cancelled" });
    signIns.cancel();
    assert.deepEqual(await second, { outcome: "cancelled" });
  });

  it("refuses a request that isn't a provider, opening nothing", async () => {
    const opened = [];
    const signIns = browserSignIns({ nimbusUrl: nimbus, openExternal: (a) => opened.push(a) });
    await assert.rejects(signIns.start({ provider: "https://evil.example" }), /provider/);
    assert.equal(opened.length, 0);
  });
});
