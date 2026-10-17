import { MantineProvider } from "@mantine/core";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bone, Loading } from "./skeleton";
import { stubMatchMedia } from "./test-support";

let restoreMatchMedia: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  restoreMatchMedia = stubMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  restoreMatchMedia();
});

function renderLoading() {
  return render(
    <MantineProvider>
      <Loading>
        <Bone h={10} />
      </Loading>
    </MantineProvider>,
  );
}

describe("Loading", () => {
  it("is marked busy at once but draws nothing before 200ms", () => {
    const { container } = renderLoading();
    act(() => vi.advanceTimersByTime(199));
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(container.querySelector(".nimbus-bone")).toBeNull();
  });

  it("draws the shapes after 200ms, hidden from screen readers", () => {
    const { container } = renderLoading();
    act(() => vi.advanceTimersByTime(200));
    const bone = container.querySelector(".nimbus-bone");
    expect(bone).not.toBeNull();
    expect(bone!.closest("[aria-hidden='true']")).not.toBeNull();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });
});
