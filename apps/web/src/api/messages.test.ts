import { describe, expect, it } from "vitest";
import { providerSignInErrorMessage } from "./messages";

describe("providerSignInErrorMessage", () => {
  it("says nothing when the sign-in page was opened without an error", () => {
    expect(providerSignInErrorMessage(null)).toBeNull();
  });

  it("explains each code the server redirects with", () => {
    expect(providerSignInErrorMessage("email_unverified")).toMatch(/verified/i);
    expect(providerSignInErrorMessage("cancelled")).toMatch(/cancel/i);
    expect(providerSignInErrorMessage("failed")).toMatch(/went wrong/i);
  });

  it("names the provider the error is about", () => {
    expect(providerSignInErrorMessage("email_unverified", "github")).toBe(
      "Your GitHub account needs a verified email address. Verify it with GitHub, or use another way to sign in.",
    );
    expect(providerSignInErrorMessage("cancelled", "google")).toMatch(/Google/);
  });

  it("does not echo a provider it doesn't know", () => {
    expect(providerSignInErrorMessage("failed", "<b>x</b>")).not.toContain("<b>");
  });

  it("treats a code it doesn't know like any other failure, without echoing it back", () => {
    const message = providerSignInErrorMessage("<script>alert(1)</script>");

    expect(message).toMatch(/went wrong/i);
    expect(message).not.toContain("script");
  });
});
