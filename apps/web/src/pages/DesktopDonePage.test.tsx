// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DesktopDonePage from "./DesktopDonePage";

const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  restoreMatchMedia();
  vi.restoreAllMocks();
});

function show(path: string, userAgent = WINDOWS) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <DesktopDonePage />
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

describe("the browser tab after a Desktop app sign-in", () => {
  it("sends the User back to the app, named as in the Sessions list, with the provider", () => {
    show("/auth/desktop-done?provider=google");

    expect(screen.getByRole("heading", { name: "Continue in Nimbus for Windows" })).toBeTruthy();
    expect(document.body.textContent).toContain("You can close this tab.");
    expect(screen.getByText("Signed in with Google")).toBeTruthy();
  });

  it("names the Mac app on a Mac, and leaves out a provider it doesn't know", () => {
    show("/auth/desktop-done?provider=<b>x</b>", MAC);

    expect(screen.getByRole("heading", { name: "Continue in Nimbus for Mac" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Signed in with");
  });

  it("speaks of a connect when it was one", () => {
    show("/auth/desktop-done?provider=github&connect=1");

    expect(document.body.textContent).toContain("Nimbus is finishing connecting GitHub there.");
  });

  it("sends a tab left behind by Open the browser again to the newer one", () => {
    show("/auth/desktop-done?outdated=1");

    expect(screen.getByRole("heading", { name: "Use the newer tab" })).toBeTruthy();
    expect(document.body.textContent).toContain("Finish it there.");
  });

  it("says when it didn't finish", () => {
    show("/auth/desktop-done?provider=github&failed=1");

    expect(screen.getByRole("heading", { name: "Signing in didn’t finish" })).toBeTruthy();
    expect(document.body.textContent).toContain("Go back to Nimbus for Windows and try again.");
    expect(document.body.textContent).not.toContain("Signed in with");
  });
});
