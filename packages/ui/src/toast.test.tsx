import { MantineProvider } from "@mantine/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NimbusToasts, toast } from "./toast";

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no matchMedia; Mantine asks it about reduced motion.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

afterEach(() => {
  act(() => toast.clear());
  cleanup();
  vi.useRealTimers();
});

/** The toasts on screen, as a page shows them. */
function renderToasts() {
  render(
    <MantineProvider>
      <NimbusToasts position="bottom-right" />
    </MantineProvider>,
  );
}

/**
 * Lets time pass, as if the User left the toasts alone. In small steps so React renders in between: a toast starts
 * its countdown only once it has finished sliding in.
 */
function wait(ms: number) {
  for (let passed = 0; passed < ms; passed += 100) act(() => vi.advanceTimersByTime(100));
}

describe("toasts", () => {
  it("shows an error as an alert that stays until it is closed", () => {
    renderToasts();
    act(() => toast.error("Couldn't save. Try again."));

    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("Couldn't save. Try again.");
    wait(30_000);
    expect(screen.queryByRole("alert")).not.toBeNull();

    act(() => screen.getByRole("button", { name: "Close" }).click());
    wait(1_000);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["success", toast.success, 4_000],
    ["info", toast.info, 4_000],
    ["warning", toast.warning, 6_000],
  ] as const)("says a %s politely and closes it on its own", (_kind, show, closesAfter) => {
    renderToasts();
    act(() => show("Display name saved."));

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Display name saved.");
    expect(screen.queryByRole("alert")).toBeNull();
    wait(closesAfter - 500);
    expect(screen.queryByRole("status")).not.toBeNull();
    wait(1_500);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("marks each toast with its kind and an icon, a different one for each kind that closes on its own", () => {
    renderToasts();
    act(() => {
      toast.success("Saved");
      toast.info("Heads up");
      toast.warning("Saved, but");
    });
    wait(500);
    const toasts = screen.getAllByRole("status");
    expect(toasts.map((shown) => shown.getAttribute("data-kind"))).toEqual([
      "success",
      "info",
      "warning",
    ]);
    const icons = toasts.map((shown) => shown.querySelector("svg")?.outerHTML);
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(3);

    act(() => {
      toast.clear();
      toast.error("Failed");
    });
    wait(500);
    expect(screen.getByRole("alert").getAttribute("data-kind")).toBe("error");
  });

  it("shows at most three at once; the next waits for one to close", () => {
    renderToasts();
    act(() => {
      toast.error("First");
      toast.error("Second");
      toast.error("Third");
      toast.error("Fourth");
    });
    wait(500);
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "First",
      "Second",
      "Third",
    ]);

    act(() => screen.getAllByRole("button", { name: "Close" })[0]!.click());
    wait(1_000);
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Second",
      "Third",
      "Fourth",
    ]);
  });
});
