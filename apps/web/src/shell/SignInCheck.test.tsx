// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignInCheck } from "./SignInCheck";

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  restoreMatchMedia();
});

describe("the sign-in check", () => {
  it("tells screen readers what it is doing, and shows the logo without a description", async () => {
    render(
      <NimbusThemeProvider>
        <SignInCheck message="Checking your session" />
      </NimbusThemeProvider>,
    );

    // Announced a moment after it appears, as a change to a region that is already there.
    expect(screen.getByRole("status").textContent).toBe("");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Checking your session"),
    );
    // The logo is decoration (an empty alt), so it isn't announced as an image.
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("says it is signing the User in by default", async () => {
    render(
      <NimbusThemeProvider>
        <SignInCheck />
      </NimbusThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Signing you in"));
  });
});
