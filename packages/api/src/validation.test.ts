import { describe, expect, it } from "vitest";
import { displayNameError, emailError, passwordError } from "./validation";

describe("displayNameError", () => {
  it("asks for a name, ignoring spaces around it", () => {
    expect(displayNameError("  ")).toBe("Enter your name");
    expect(displayNameError(" Ada ")).toBeNull();
  });

  it("counts an emoji as one character, as the server does", () => {
    expect(displayNameError("😀".repeat(100))).toBeNull();
    expect(displayNameError("a".repeat(101))).toBe("Use at most 100 characters");
  });
});

describe("emailError", () => {
  it("wants something shaped like an address", () => {
    expect(emailError(" ada@example.com ")).toBeNull();
    expect(emailError("ada@example")).toBe("Enter a valid email address");
  });
});

describe("passwordError", () => {
  it("keeps to 8 to 128 characters", () => {
    expect(passwordError("short")).toBe("Use 8 to 128 characters");
    expect(passwordError("correct horse")).toBeNull();
    expect(passwordError("a".repeat(129))).toBe("Use 8 to 128 characters");
  });
});
