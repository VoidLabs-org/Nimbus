import { describe, expect, it } from "vitest";
import {
  aimAt,
  describeEdge,
  describePlace,
  neighboursAt,
  nextPlace,
  placeOf,
  type Group,
} from "./keyboardDrag";

const groups: Group[] = [
  { id: "s1", name: "To do", keys: ["NIM-1", "NIM-2", "NIM-3"] },
  { id: "s2", name: "In progress", keys: ["NIM-4", "NIM-5"] },
  { id: "s3", name: "Done", keys: [] },
];

describe("placeOf", () => {
  it("is the card's own group and index among the others", () => {
    expect(placeOf(groups, "NIM-2")).toEqual({ group: 0, index: 1 });
    expect(placeOf(groups, "NIM-5")).toEqual({ group: 1, index: 1 });
    expect(placeOf(groups, "NIM-9")).toBeNull();
  });
});

describe("nextPlace", () => {
  it("with wrapping, carries the card across a group's end into the next or previous group", () => {
    const wrap = (carried: string, group: number, index: number, direction: "up" | "down") =>
      nextPlace(groups, carried, { group, index }, direction, () => index, true);
    // Down past the last of To do (2 others, so index 2): first in In progress.
    expect(wrap("NIM-2", 0, 2, "down")).toEqual({ group: 1, index: 0 });
    // Up from the first of In progress: after the last of To do's other cards.
    expect(wrap("NIM-4", 1, 0, "up")).toEqual({ group: 0, index: 3 });
    // Into an empty group, and out of it again.
    expect(wrap("NIM-5", 1, 1, "down")).toEqual({ group: 2, index: 0 });
    expect(wrap("NIM-5", 2, 0, "up")).toEqual({ group: 1, index: 1 });
    // The first and last groups still stop.
    expect(wrap("NIM-1", 0, 0, "up")).toEqual({ group: 0, index: 0 });
    expect(wrap("NIM-5", 2, 0, "down")).toEqual({ group: 2, index: 0 });
  });

  it("moves one place up or down within the group, and stops at its ends", () => {
    expect(nextPlace(groups, "NIM-2", { group: 0, index: 1 }, "down")).toEqual({
      group: 0,
      index: 2,
    });
    expect(nextPlace(groups, "NIM-2", { group: 0, index: 2 }, "down")).toEqual({
      group: 0,
      index: 2,
    });
    expect(nextPlace(groups, "NIM-2", { group: 0, index: 0 }, "up")).toEqual({
      group: 0,
      index: 0,
    });
  });

  it("goes one past the last card of another group, since it isn't in there", () => {
    expect(nextPlace(groups, "NIM-2", { group: 1, index: 1 }, "down")).toEqual({
      group: 1,
      index: 2,
    });
    expect(nextPlace(groups, "NIM-2", { group: 1, index: 2 }, "down")).toEqual({
      group: 1,
      index: 2,
    });
  });

  it("moves to the neighbouring group at the index `across` gives, kept within that group", () => {
    expect(nextPlace(groups, "NIM-3", { group: 0, index: 2 }, "right", () => 1)).toEqual({
      group: 1,
      index: 1,
    });
    // Without `across`, at the same index, as far down as that group goes.
    expect(nextPlace(groups, "NIM-3", { group: 0, index: 2 }, "right")).toEqual({
      group: 1,
      index: 2,
    });
    expect(nextPlace(groups, "NIM-3", { group: 1, index: 2 }, "right")).toEqual({
      group: 2,
      index: 0,
    });
    // Back into its own group, where it counts once.
    expect(nextPlace(groups, "NIM-3", { group: 1, index: 2 }, "left", () => 9)).toEqual({
      group: 0,
      index: 2,
    });
  });

  it("stays put past the first and last group", () => {
    expect(nextPlace(groups, "NIM-1", { group: 0, index: 0 }, "left")).toEqual({
      group: 0,
      index: 0,
    });
    expect(nextPlace(groups, "NIM-1", { group: 2, index: 0 }, "right")).toEqual({
      group: 2,
      index: 0,
    });
  });
});

describe("neighboursAt", () => {
  it("names the cards directly above and below the place, leaving the carried one out", () => {
    expect(neighboursAt(groups, "NIM-1", { group: 0, index: 1 })).toEqual({
      after: "NIM-2",
      before: "NIM-3",
    });
    expect(neighboursAt(groups, "NIM-3", { group: 0, index: 0 })).toEqual({
      after: undefined,
      before: "NIM-1",
    });
    expect(neighboursAt(groups, "NIM-1", { group: 1, index: 2 })).toEqual({
      after: "NIM-5",
      before: undefined,
    });
    expect(neighboursAt(groups, "NIM-1", { group: 2, index: 0 })).toEqual({
      after: undefined,
      before: undefined,
    });
  });
});

describe("aimAt", () => {
  it("is the card at that index in its own group, so the others make way", () => {
    expect(aimAt(groups, "NIM-1", { group: 0, index: 2 })).toBe("NIM-3");
    expect(aimAt(groups, "NIM-1", { group: 0, index: 0 })).toBe("NIM-1");
  });

  it("is the card it lands above in another group, the last one past the end, the group when empty", () => {
    expect(aimAt(groups, "NIM-1", { group: 1, index: 0 })).toBe("NIM-4");
    expect(aimAt(groups, "NIM-1", { group: 1, index: 2 })).toBe("NIM-5");
    expect(aimAt(groups, "NIM-1", { group: 2, index: 0 })).toBe("s3");
  });
});

describe("describePlace", () => {
  it("says the position counting the carried card, and the group", () => {
    expect(describePlace(groups, "NIM-2", { group: 0, index: 2 })).toBe(
      "NIM-2, position 3 of 3 in To do",
    );
    expect(describePlace(groups, "NIM-2", { group: 1, index: 0 })).toBe(
      "NIM-2, position 1 of 3 in In progress",
    );
    expect(describePlace(groups, "NIM-2", { group: 2, index: 0 })).toBe(
      "NIM-2, position 1 of 1 in Done",
    );
  });
});

describe("describePlace with cards not shown", () => {
  it("counts the group's total, not only the cards shown", () => {
    const partial: Group[] = [
      { id: "s1", name: "To do", keys: ["NIM-1", "NIM-2"], total: 250 },
      { id: "s2", name: "Done", keys: ["NIM-3"], total: 40 },
    ];
    expect(describePlace(partial, "NIM-1", { group: 0, index: 1 })).toBe(
      "NIM-1, position 2 of 250 in To do",
    );
    expect(describePlace(partial, "NIM-1", { group: 1, index: 1 })).toBe(
      "NIM-1, position 2 of 41 in Done",
    );
  });
});

describe("describeEdge", () => {
  it("says the card can't go further that way", () => {
    expect(describeEdge(groups, "NIM-1", { group: 0, index: 0 }, "up")).toBe(
      "NIM-1 is already first in To do",
    );
    expect(describeEdge(groups, "NIM-3", { group: 0, index: 2 }, "down")).toBe(
      "NIM-3 is already last in To do",
    );
    expect(describeEdge(groups, "NIM-1", { group: 0, index: 0 }, "left")).toBe(
      "NIM-1 is already in the first column, To do",
    );
  });
});
