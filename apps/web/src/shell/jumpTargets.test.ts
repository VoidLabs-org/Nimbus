import { describe, expect, it } from "vitest";
import { splitMatch } from "./jumpTargets";

describe("splitMatch", () => {
  it("marks the first place the search appears, ignoring case", () => {
    expect(splitMatch("Security", "ECU")).toEqual({ before: "S", hit: "ecu", after: "rity" });
  });

  it("marks nothing when the search isn't there, or is empty", () => {
    expect(splitMatch("Home", "zebra")).toEqual({ before: "Home", hit: "", after: "" });
    expect(splitMatch("Home", "")).toEqual({ before: "Home", hit: "", after: "" });
  });

  it("marks the right letters after one that lowercases to two, such as the Turkish İ", () => {
    expect(splitMatch("İstanbul launch", "launch")).toEqual({
      before: "İstanbul ",
      hit: "launch",
      after: "",
    });
  });
});
