import { describe, expect, it } from "vitest";
import {
  advanceMove,
  moveDelay,
  planMove,
  RETRACT_MS,
  SETTLE_MS,
  startMove,
  TRAVEL_MS,
  type MoveState,
} from "./navMove";

describe("planMove", () => {
  it("goes round the shared corner between neighbouring edges", () => {
    expect(planMove("top", "left")).toEqual(["tl"]);
    expect(planMove("top", "right")).toEqual(["tr"]);
    expect(planMove("bottom", "left")).toEqual(["bl"]);
    expect(planMove("bottom", "right")).toEqual(["br"]);
    expect(planMove("left", "top")).toEqual(["tl"]);
    expect(planMove("right", "bottom")).toEqual(["br"]);
  });

  it("slides along a side between opposite edges", () => {
    expect(planMove("top", "bottom")).toEqual(["tl", "bl"]);
    expect(planMove("bottom", "top")).toEqual(["bl", "tl"]);
    expect(planMove("left", "right")).toEqual(["tl", "tr"]);
    expect(planMove("right", "left")).toEqual(["tr", "tl"]);
  });
});

/** Every state a move passes through, from its first to the moment it is idle again. */
function run(from: MoveState["shown"], to: MoveState["shown"]) {
  let state: MoveState = startMove(from, to);
  const states = [state];
  while (state.phase !== "idle") {
    state = advanceMove(state);
    states.push(state);
  }
  return states;
}

describe("a move", () => {
  it("retracts to the corner, swaps the layout there, then extends (neighbouring edges)", () => {
    expect(run("top", "left").map((s) => [s.phase, s.shown, s.corner])).toEqual([
      ["pill", "top", "tl"],
      ["arrive", "left", "tl"],
      ["idle", "left", "tl"],
    ]);
  });

  it("retracts, travels along the side, swaps at the far corner, then extends (opposite edges)", () => {
    expect(run("top", "bottom").map((s) => [s.phase, s.shown, s.corner])).toEqual([
      ["pill", "top", "tl"],
      ["pill", "top", "bl"],
      ["arrive", "bottom", "bl"],
      ["idle", "bottom", "bl"],
    ]);
  });
});

describe("moveDelay", () => {
  it("waits for the retract, then each leg of travel, then the layout to settle", () => {
    const [retract, travel, arrive] = run("left", "right");
    expect(moveDelay(retract!)).toBe(RETRACT_MS);
    expect(moveDelay(travel!)).toBe(TRAVEL_MS);
    expect(arrive!.phase).toBe("arrive");
    expect(moveDelay(arrive!)).toBe(SETTLE_MS);
  });
});
