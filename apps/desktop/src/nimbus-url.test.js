import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNavigationAllowed, isNimbusPage, parseNimbusUrl } from "./nimbus-url.js";

describe("isNimbusPage", () => {
  const nimbus = new URL("http://localhost:3000");

  it("is any page of Nimbus's own origin", () => {
    assert.equal(isNimbusPage(nimbus, "http://localhost:3000/settings/appearance"), true);
  });

  it("is not a provider's page, another site or a page with no web origin", () => {
    for (const address of [
      "https://github.com/login",
      "https://localhost:3000/",
      "http://localhost:3001/",
      "about:blank",
      "",
    ]) {
      assert.equal(isNimbusPage(nimbus, address), false, address);
    }
  });
});

describe("parseNimbusUrl", () => {
  it("defaults to the dev server", () => {
    assert.equal(parseNimbusUrl(undefined).href, "http://localhost:3000/");
    assert.equal(parseNimbusUrl("  ").href, "http://localhost:3000/");
  });

  it("takes an http or https address", () => {
    assert.equal(parseNimbusUrl("https://nimbus.example").origin, "https://nimbus.example");
    assert.equal(parseNimbusUrl(" http://10.0.0.5:3000/ ").origin, "http://10.0.0.5:3000");
  });

  it("refuses anything else, saying what to fix", () => {
    for (const value of ["nimbus", "ftp://x.example", "file:///etc", "app://nimbus", "http://"]) {
      assert.throws(() => parseNimbusUrl(value), /NIMBUS_URL/, value);
    }
  });
});

describe("isNavigationAllowed", () => {
  const nimbus = new URL("http://localhost:3000");
  const here = "http://localhost:3000/settings";
  const github = "https://github.com/login?client_id=x";

  it("allows any page of Nimbus's own origin", () => {
    assert.equal(isNavigationAllowed(nimbus, here, "http://localhost:3000/"), true);
    assert.equal(
      isNavigationAllowed(nimbus, here, "http://localhost:3000/settings/profile?x=1"),
      true,
    );
    // Back from a provider's page.
    assert.equal(isNavigationAllowed(nimbus, github, "http://localhost:3000/auth/callback"), true);
  });

  it("lets a provider's page navigate within itself, so its own sign-in form works", () => {
    assert.equal(isNavigationAllowed(nimbus, github, "https://github.com/session"), true);
    assert.equal(
      isNavigationAllowed(
        nimbus,
        "https://accounts.google.com/v3/signin",
        "https://accounts.google.com/signin/challenge",
      ),
      true,
    );
  });

  it("refuses a hop from Nimbus to another site", () => {
    for (const target of [
      "https://localhost:3000/",
      "http://localhost:3001/",
      "http://localhost:3000.evil.example/",
      "http://evil.example/http://localhost:3000/",
      "https://accounts.google.com/",
      "file:///C:/secret.txt",
    ]) {
      assert.equal(isNavigationAllowed(nimbus, here, target), false, target);
    }
  });

  it("refuses a hop from a provider's page to a third site", () => {
    for (const target of [
      "https://accounts.google.com/",
      "https://github.com.evil.example/",
      "http://github.com/",
      "file:///C:/x",
    ]) {
      assert.equal(isNavigationAllowed(nimbus, github, target), false, target);
    }
  });

  it("allows nothing from a page that has no web origin, except Nimbus", () => {
    for (const current of [
      "about:blank",
      "data:text/html,x",
      "file:///C:/x.html",
      "not a url",
      "",
    ]) {
      assert.equal(isNavigationAllowed(nimbus, current, "http://localhost:3000/"), true, current);
      assert.equal(isNavigationAllowed(nimbus, current, "file:///C:/x.html"), false, current);
      assert.equal(isNavigationAllowed(nimbus, current, "https://github.com/"), false, current);
    }
  });

  it("refuses an address that can't be read", () => {
    assert.equal(isNavigationAllowed(nimbus, here, "not a url"), false);
  });
});
