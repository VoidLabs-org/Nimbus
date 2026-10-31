import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWindowState, restoredPlace, windowState } from "./windows.js";

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

  it("is restored as it was when it fits on a screen", () => {
    const state = { x: 100, y: 80, width: 1280, height: 800, maximized: false };
    assert.deepEqual(restoredPlace(state, screens), {
      bounds: { x: 100, y: 80, width: 1280, height: 800 },
      maximized: false,
    });
  });

  it("shrinks to the screen it is on when it was bigger, as after undocking from a large monitor", () => {
    const laptop = [{ x: 0, y: 0, width: 1366, height: 728 }];
    const state = { x: 0, y: 0, width: 2400, height: 1300, maximized: false };
    assert.deepEqual(restoredPlace(state, laptop).bounds, {
      x: 0,
      y: 0,
      width: 1366,
      height: 728,
    });
  });

  it("never shrinks below the smallest window, on a screen smaller than that: it starts at the screen's corner", () => {
    const small = [{ x: 0, y: 0, width: 720, height: 1200 }];
    const state = { x: 40, y: 100, width: 1280, height: 800, maximized: false };
    assert.deepEqual(restoredPlace(state, small).bounds, {
      x: 0,
      y: 100,
      width: 800,
      height: 800,
    });
  });

  it("moves fully onto the screen it was mostly off, so it can always be dragged", () => {
    const state = { x: -1180, y: 80, width: 1280, height: 800, maximized: false };
    assert.deepEqual(restoredPlace(state, screens).bounds, {
      x: 0,
      y: 80,
      width: 1280,
      height: 800,
    });
  });

  it("goes to the screen it was mostly on, when it spans two", () => {
    const two = [
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 1920, y: 0, width: 1280, height: 984 },
    ];
    const state = { x: 1800, y: 40, width: 1200, height: 800, maximized: false };
    assert.deepEqual(restoredPlace(state, two).bounds, {
      x: 1920,
      y: 40,
      width: 1200,
      height: 800,
    });
  });

  it("opens centred on a screen that is gone, still maximized if it was", () => {
    const state = { x: 2400, y: 80, width: 1280, height: 800, maximized: true };
    assert.deepEqual(restoredPlace(state, screens), { bounds: null, maximized: true });
    const offTheTop = { x: 100, y: -900, width: 1280, height: 800, maximized: false };
    assert.deepEqual(restoredPlace(offTheTop, screens), { bounds: null, maximized: false });
  });
});
