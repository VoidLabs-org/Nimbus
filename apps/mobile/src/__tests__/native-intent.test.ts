import { redirectSystemPath } from "../app/+native-intent";

describe("the link a provider sign-in ends with", () => {
  it.each([
    "nimbus://auth?code=c-1",
    "nimbus:///auth?error=cancelled&provider=google",
    "/auth?code=c-1",
    "auth",
  ])("keeps the app where it is (%s)", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBeNull();
  });

  it("starts the app as usual when the link opened it", () => {
    expect(redirectSystemPath({ path: "nimbus://auth?code=c-1", initial: true })).toBe("/");
  });

  it("leaves every other link alone", () => {
    expect(redirectSystemPath({ path: "nimbus://settings", initial: false })).toBe(
      "nimbus://settings",
    );
    expect(redirectSystemPath({ path: "/authenticator", initial: false })).toBe("/authenticator");
  });
});
