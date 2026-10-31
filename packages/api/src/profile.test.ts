import { describe, expect, it } from "vitest";
import { emailChangeCodeMessage, initialsOf, pictureFileError, WRONG_FILE } from "./profile";

describe("pictureFileError", () => {
  it("takes JPEG, PNG and WebP up to 5 MB", () => {
    expect(pictureFileError({ type: "image/png", size: 5 * 1024 * 1024 })).toBeNull();
    expect(pictureFileError({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe(WRONG_FILE);
    expect(pictureFileError({ type: "image/heic", size: 10 })).toBe(WRONG_FILE);
  });

  it("leaves a size the phone didn't report to the server", () => {
    expect(pictureFileError({ type: "image/jpeg" })).toBeNull();
  });
});

describe("emailChangeCodeMessage", () => {
  it("says how many tries are left when the server said", () => {
    expect(emailChangeCodeMessage(2)).toBe("That code didn’t match. 2 tries left.");
    expect(emailChangeCodeMessage(1)).toBe("That code didn’t match. 1 try left.");
    expect(emailChangeCodeMessage(null)).toBe("That code didn’t match.");
  });
});

describe("initialsOf", () => {
  it("draws the first two words' first letters, or a lone word's first two", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("Ada")).toBe("AD");
  });
});
