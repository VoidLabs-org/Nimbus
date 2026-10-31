import { describe, expect, it } from "vitest";
import { keyForName, storedKey, suggestKey } from "./projectKey";

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

  it("suggests nothing rather than a key too short to be accepted", () => {
    expect(suggestKey("X")).toBe("");
    expect(suggestKey("Q!")).toBe("");
    expect(suggestKey("1 a")).toBe("");
  });

  it("is empty for an empty name", () => {
    expect(suggestKey("")).toBe("");
  });
});

describe("storedKey", () => {
  it("writes a key in capitals, as the server stores it", () => {
    expect(storedKey("nIm")).toBe("NIM");
  });

  it("leaves letters that Unicode capitalises into ASCII ones alone, as the server does", () => {
    // "ſ" (long s) and "ı" (dotless i) are S and I in upper case, but the server matches them to no project.
    expect(storedKey("ſam")).toBe("ſAM");
    expect(storedKey("nım")).toBe("NıM");
  });
});

describe("keyForName", () => {
  it("fills an empty key from the name", () => {
    expect(keyForName("", "Nimbus web", "")).toBe("NW");
  });

  it("keeps following the name while the key is still the suggestion", () => {
    expect(keyForName("Nimbus web", "Nimbus web app", "NW")).toBe("NWA");
  });

  it("leaves a key the User chose alone", () => {
    expect(keyForName("Nimbus web", "Nimbus web app", "WEB")).toBe("WEB");
  });

  it("follows the name again once the User clears the key", () => {
    expect(keyForName("Nimbus web", "Nimbus web app", "")).toBe("NWA");
  });
});
