import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectivePosition,
  isVertical,
  menuPlacement,
  NAV_POSITION_KEY,
  parseNavPosition,
  readNavPosition,
  shortcutPosition,
  writeNavPosition,
} from "./navPosition";

describe("parseNavPosition", () => {
  it("accepts the four edges", () => {
    for (const edge of ["top", "bottom", "left", "right"] as const)
      expect(parseNavPosition(edge)).toBe(edge);
  });

  it("falls back to top for anything else", () => {
    expect(parseNavPosition(null)).toBe("top");
    expect(parseNavPosition("")).toBe("top");
    expect(parseNavPosition("middle")).toBe("top");
  });
});

describe("effectivePosition", () => {
  it("is the chosen edge on a wide screen", () => {
    expect(effectivePosition("left", false)).toBe("left");
  });

  it("is always the top on a narrow screen, whatever was chosen", () => {
    expect(effectivePosition("left", true)).toBe("top");
    expect(effectivePosition("bottom", true)).toBe("top");
  });
});

describe("isVertical", () => {
  it("is true only for the left and right edges", () => {
    expect(["top", "bottom", "left", "right"].map((p) => isVertical(p as never))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});

describe("menuPlacement", () => {
  it("opens the account menu towards the free side of each edge", () => {
    expect(menuPlacement("top")).toBe("bottom-end");
    expect(menuPlacement("bottom")).toBe("top-end");
    expect(menuPlacement("left")).toBe("right-end");
    expect(menuPlacement("right")).toBe("left-end");
  });
});

describe("stored position", () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => void (data[key] = value),
    });
    return data;
  }

  it("reads what was saved, and top when nothing was", () => {
    fakeStorage({ [NAV_POSITION_KEY]: "right" });
    expect(readNavPosition()).toBe("right");
    fakeStorage();
    expect(readNavPosition()).toBe("top");
  });

  it("writes the choice under the shared key", () => {
    const data = fakeStorage();
    writeNavPosition("bottom");
    expect(data[NAV_POSITION_KEY]).toBe("bottom");
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readNavPosition()).toBe("top");
    expect(() => writeNavPosition("left")).not.toThrow();
  });
});

describe("shortcutPosition", () => {
  const keys = (key: string, overrides = {}) => ({
    key,
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    ...overrides,
  });

  it("points an Alt + Shift + arrow key at the edge the arrow points to", () => {
    expect(shortcutPosition(keys("ArrowUp"))).toBe("top");
    expect(shortcutPosition(keys("ArrowDown"))).toBe("bottom");
    expect(shortcutPosition(keys("ArrowLeft"))).toBe("left");
    expect(shortcutPosition(keys("ArrowRight"))).toBe("right");
  });

  it("ignores other keys and other modifier combinations", () => {
    expect(shortcutPosition(keys("a"))).toBeNull();
    expect(shortcutPosition(keys("ArrowUp", { shiftKey: false }))).toBeNull();
    expect(shortcutPosition(keys("ArrowUp", { altKey: false }))).toBeNull();
    expect(shortcutPosition(keys("ArrowUp", { ctrlKey: true }))).toBeNull();
    expect(shortcutPosition(keys("ArrowUp", { metaKey: true }))).toBeNull();
  });
});
