// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopFrame } from "./DesktopFrame";
import type { NimbusDesktop } from "./desktop";

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  delete window.nimbusDesktop;
  restoreMatchMedia();
});

function renderFrame() {
  return render(
    <NimbusThemeProvider>
      <DesktopFrame />
    </NimbusThemeProvider>,
  );
}

describe("DesktopFrame", () => {
  it("tells the window whether the theme is light or dark, on any page", async () => {
    const setTheme = vi.fn<NimbusDesktop["setTheme"]>();
    window.nimbusDesktop = { platform: "win32", setTheme, showAppMenu: vi.fn() };
    renderFrame();

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith("light"));
  });

  it("names the platform for the stylesheet and draws the drag strip", () => {
    window.nimbusDesktop = { platform: "darwin", setTheme: vi.fn(), showAppMenu: vi.fn() };
    const { container, unmount } = renderFrame();

    expect(document.documentElement.dataset.desktop).toBe("darwin");
    expect(container.querySelector(".nimbus-window-frame")).not.toBeNull();
    unmount();
    expect(document.documentElement.dataset.desktop).toBeUndefined();
  });

  it("does nothing in a browser", () => {
    const { container } = renderFrame();

    expect(document.documentElement.dataset.desktop).toBeUndefined();
    expect(container.querySelector(".nimbus-window-frame")).toBeNull();
  });
});
