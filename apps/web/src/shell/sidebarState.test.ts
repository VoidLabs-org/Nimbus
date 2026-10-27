import { describe, expect, it } from "vitest";
import { isFoldShortcut, parseSidebarState } from "./sidebarState";

const none = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: false };
const backslash = { key: "\\", code: "Backslash" };

describe("parseSidebarState", () => {
  it("is open unless folded was stored", () => {
    expect(parseSidebarState("folded")).toBe("folded");
    expect(parseSidebarState("open")).toBe("open");
    expect(parseSidebarState(null)).toBe("open");
    expect(parseSidebarState("sideways")).toBe("open");
  });
});

describe("isFoldShortcut", () => {
  it("is Ctrl \\ on Windows and Linux", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(isFoldShortcut({ ...none, ...backslash, ctrlKey: true }, platform)).toBe(true);
      expect(isFoldShortcut({ ...none, ...backslash, metaKey: true }, platform)).toBe(false);
    }
  });

  it("is ⌘ \\ on macOS", () => {
    expect(isFoldShortcut({ ...none, ...backslash, metaKey: true }, "darwin")).toBe(true);
    expect(isFoldShortcut({ ...none, ...backslash, ctrlKey: true }, "darwin")).toBe(false);
  });

  it("counts the key's position on keyboards where it types something else", () => {
    expect(isFoldShortcut({ ...none, key: "#", code: "Backslash", ctrlKey: true }, "win32")).toBe(
      true,
    );
  });

  it("ignores other keys and extra modifiers", () => {
    expect(isFoldShortcut({ ...none, key: "k", code: "KeyK", ctrlKey: true }, "win32")).toBe(false);
    expect(isFoldShortcut({ ...none, ...backslash }, "win32")).toBe(false);
    expect(isFoldShortcut({ ...none, ...backslash, ctrlKey: true, shiftKey: true }, "win32")).toBe(
      false,
    );
    expect(isFoldShortcut({ ...none, ...backslash, ctrlKey: true, altKey: true }, "win32")).toBe(
      false,
    );
  });
});
