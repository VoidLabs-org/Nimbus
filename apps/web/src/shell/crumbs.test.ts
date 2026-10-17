import { describe, expect, it } from "vitest";
import { collapseCrumbs, type Crumb } from "./crumbs";

const long: Crumb[] = [
  { label: "A", to: "/a" },
  { label: "B", to: "/b" },
  { label: "C", to: "/c" },
  { label: "D" },
];

describe("collapseCrumbs", () => {
  it("shows every crumb when there is room", () => {
    expect(collapseCrumbs(long, false)).toEqual({ shown: long, hidden: [], up: null });
  });

  it("keeps short paths whole even when narrow", () => {
    const short = long.slice(0, 3);
    expect(collapseCrumbs(short, true)).toEqual({ shown: short, hidden: [], up: null });
  });

  it("when narrow, hides the middle of a path of four or more and offers the parent as up", () => {
    expect(collapseCrumbs(long, true)).toEqual({
      shown: [long[0], long[3]],
      hidden: [long[1], long[2]],
      up: long[2],
    });
  });

  it("offers the nearest linked crumb as up when the parent is still pending", () => {
    const loading: Crumb[] = [
      { label: "A", to: "/a" },
      { label: "B", to: "/b" },
      { label: "", pending: true },
      { label: "", pending: true },
    ];
    expect(collapseCrumbs(loading, true).up).toEqual({ label: "B", to: "/b" });
  });
});
