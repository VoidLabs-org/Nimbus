import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWindowState, restoredBounds, windowState } from "./windows.js";

describe("the app window's saved place", () => {
  const screens = [{ x: 0, y: 0, width: 1920, height: 1040 }];

  it("is saved as its normal bounds and whether it was maximized", () => {
    const saved = windowState({ x: 100, y: 80, width: 1280, height: 800 }, true);
    assert.deepEqual(parseWindowState(saved), {
      x: 100,
      y: 80,
      width: 1280,
      height: 800,
      maximized: true,
    });
  });

  it("is forgotten when the file is missing, broken or below the smallest window", () => {
    assert.equal(parseWindowState(null), null);
    assert.equal(parseWindowState("{not json"), null);
    assert.equal(parseWindowState(JSON.stringify({ x: 0, y: 0, width: "wide" })), null);
    assert.equal(
      parseWindowState(JSON.stringify({ x: 0, y: 0, width: 300, height: 200, maximized: false })),
      null,
    );
  });

  it("is restored when its title row is on a screen", () => {
    const state = { x: 100, y: 80, width: 1280, height: 800, maximized: false };
    assert.deepEqual(restoredBounds(state, screens), state);
  });

  it("is not restored on a screen that is gone, so the window opens centred", () => {
    const state = { x: 2400, y: 80, width: 1280, height: 800, maximized: false };
    assert.equal(restoredBounds(state, screens), null);
    const offTheTop = { x: 100, y: -900, width: 1280, height: 800, maximized: false };
    assert.equal(restoredBounds(offTheTop, screens), null);
  });
});
