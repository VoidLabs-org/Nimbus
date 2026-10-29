// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DesktopDonePage from "./DesktopDonePage";

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  restoreMatchMedia();
});

function show(path: string) {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <DesktopDonePage />
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

describe("the browser tab after a Desktop app sign-in", () => {
  it("sends the User back to the app", () => {
    show("/auth/desktop-done");

    expect(screen.getByRole("heading", { name: "Continue in the Desktop app" })).toBeTruthy();
    expect(document.body.textContent).toContain("You can close this tab.");
  });

  it("says when it didn't finish", () => {
    show("/auth/desktop-done?failed=1");

    expect(screen.getByRole("heading", { name: "Signing in didn’t finish" })).toBeTruthy();
    expect(document.body.textContent).toContain("Go back to the Nimbus Desktop app and try again.");
  });
});
