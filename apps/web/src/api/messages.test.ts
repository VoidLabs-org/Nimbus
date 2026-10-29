import { describe, expect, it } from "vitest";
import { connectErrorMessage, providerSignInErrorMessage } from "./messages";

describe("connectErrorMessage", () => {
  it("explains each code the server redirects to the Security page with", () => {
    expect(connectErrorMessage("already_linked", "google")).toMatch(/already connected/);
    expect(connectErrorMessage("already_connected", "github")).toMatch(/already have a GitHub/);
    expect(connectErrorMessage("email_unverified", "github")).toMatch(/GitHub.+verified/);
    expect(connectErrorMessage("cancelled", "google")).toMatch(/cancelled/);
    expect(connectErrorMessage("expired", "google")).toMatch(/too long/);
  });

  it("treats a code it doesn't know generically and doesn't echo an unknown provider", () => {
    const message = connectErrorMessage("<script>", "<b>x</b>");

    expect(message).toMatch(/went wrong/);
    expect(message).not.toContain("<");
  });
});

describe("providerSignInErrorMessage", () => {
  it("says nothing when the sign-in page was opened without an error", () => {
    expect(providerSignInErrorMessage(null)).toBeNull();
  });

  it("explains each code the server redirects with", () => {
    expect(providerSignInErrorMessage("email_unverified")).toMatch(/verified/i);
    expect(providerSignInErrorMessage("cancelled")).toMatch(/cancel/i);
    expect(providerSignInErrorMessage("disconnected", "google")).toMatch(
      /disconnected Google.+Security/,
    );
    expect(providerSignInErrorMessage("failed")).toMatch(/went wrong/i);
    // From the Desktop app, when the code from the browser came too late or twice.
    expect(providerSignInErrorMessage("expired", "github")).toBe(
      "That took too long. Try signing in with GitHub again.",
    );
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
