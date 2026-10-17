// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("tells screen readers it is signing the User in, and shows the logo without a description", () => {
    render(
      <NimbusThemeProvider>
        <SignInCheck />
      </NimbusThemeProvider>,
    );

    expect(screen.getByRole("status").textContent).toContain("Signing you in");
    // The logo is decoration (an empty alt), so it isn't announced as an image.
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});
