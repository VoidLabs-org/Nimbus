import { describe, expect, it } from "vitest";
import { suggestKey } from "./projectKey";

describe("suggestKey", () => {
  it("uses the initials of several words", () => {
    expect(suggestKey("Nimbus web app")).toBe("NWA");
  });

  it("uses the first letters of a single word", () => {
    expect(suggestKey("Nimbus")).toBe("NIM");
  });

  it("ignores punctuation and extra spaces between words", () => {
    expect(suggestKey("  mobile -- release ")).toBe("MR");
  });

  it("starts with a letter, dropping leading digits", () => {
    expect(suggestKey("2026 roadmap plan")).toBe("RP");
  });

  it("is at most ten characters", () => {
    expect(suggestKey("a b c d e f g h i j k l")).toBe("ABCDEFGHIJ");
  });

  it("is empty for an empty name", () => {
    expect(suggestKey("")).toBe("");
  });
});
