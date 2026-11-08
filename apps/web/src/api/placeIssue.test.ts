import { describe, expect, it } from "vitest";
import { placeIssue } from "./queries";

const card = (key: string) => ({ key });
const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("placeIssue", () => {
  const column = [card("A"), card("B"), card("C")];

  it("moves one of the items directly after `after`, else directly before `before`", () => {
    expect(keys(placeIssue(column, "C", "A", "B"))).toEqual(["A", "C", "B"]);
    expect(keys(placeIssue(column, "A", undefined, "C"))).toEqual(["B", "A", "C"]);
  });

  it("adds an Issue from another column between the cards it landed between", () => {
    expect(keys(placeIssue(column, card("X"), "B", "C"))).toEqual(["A", "B", "X", "C"]);
    expect(keys(placeIssue(column, card("X"), "C", undefined))).toEqual(["A", "B", "C", "X"]);
  });

  it("adds it first when no neighbour was named (an empty column)", () => {
    expect(keys(placeIssue([], card("X"), undefined, undefined))).toEqual(["X"]);
  });

  it("leaves the items as they are when the neighbours named aren't among them", () => {
    expect(placeIssue(column, card("X"), "Z", undefined)).toBe(column);
    expect(placeIssue(column, "C", "Z", "Y")).toBe(column);
  });
});
