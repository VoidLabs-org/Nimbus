import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nimbusUserAgent } from "./user-agent.js";

describe("nimbusUserAgent", () => {
  const electron =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) desktop/0.0.0 Chrome/138.0.7204.35 Electron/44.7.0 Safari/537.36";

  it("adds a Nimbus product token with the app's version to Electron's", () => {
    assert.equal(nimbusUserAgent(electron, "0.0.0"), `${electron} Nimbus/0.0.0`);
  });

  it("adds it only once", () => {
    const once = nimbusUserAgent(electron, "0.0.0");
    assert.equal(nimbusUserAgent(once, "0.0.0"), once);
  });
});
