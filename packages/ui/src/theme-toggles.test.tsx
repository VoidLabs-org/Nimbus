import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NimbusThemeProvider } from "./nimbus-theme";
import { stubMatchMedia } from "./test-support";
import { ThemeToggles } from "./theme-toggles";

let restoreMatchMedia: () => void;

beforeEach(() => {
  localStorage.clear();
  // A light system; jsdom has no matchMedia of its own.
  restoreMatchMedia = stubMatchMedia("light");
});

// Leave nothing behind for the next test: the real matchMedia, and no theme on the document.
afterEach(() => {
  cleanup();
  restoreMatchMedia();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mantine-color-scheme");
});

describe("ThemeToggles", () => {
  it("turns dark and glass on and off, and says which are on", () => {
    render(
      <NimbusThemeProvider>
        <ThemeToggles />
      </NimbusThemeProvider>,
    );
    const dark = screen.getByRole("button", { name: "Dark mode" });
    const glass = screen.getByRole("button", { name: "Glass" });
    expect(dark.getAttribute("aria-pressed")).toBe("false");
    expect(glass.getAttribute("aria-pressed")).toBe("false");

    act(() => dark.click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("ink");
    expect(dark.getAttribute("aria-pressed")).toBe("true");

    act(() => glass.click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("slate");
    expect(glass.getAttribute("aria-pressed")).toBe("true");

    act(() => dark.click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("fog");
  });
});
