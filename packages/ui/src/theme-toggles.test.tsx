import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NimbusThemeProvider } from "./nimbus-theme";
import { ThemeToggles } from "./theme-toggles";

beforeEach(() => {
  localStorage.clear();
  // A light system; jsdom has no matchMedia of its own.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

afterEach(cleanup);

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
