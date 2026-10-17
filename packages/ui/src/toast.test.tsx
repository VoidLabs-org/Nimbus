import { MantineProvider } from "@mantine/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "./test-support";
import { NimbusToasts, toast } from "./toast";

let restoreMatchMedia: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  restoreMatchMedia = stubMatchMedia();
});

afterEach(() => {
  act(() => toast.clear());
  cleanup();
  vi.useRealTimers();
  restoreMatchMedia();
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

/** The toasts on screen, top to bottom: their kind and message. */
function shown() {
  return [...document.querySelectorAll<HTMLElement>("[data-kind]")].map(
    (toast) => `${toast.getAttribute("data-kind")}: ${toast.textContent}`,
  );
}

/** What a screen reader is told politely: the status region's text. */
function announced() {
  return screen.getByRole("status").textContent;
}

describe("toasts", () => {
  it("shows an error as an alert that stays until it is closed", () => {
    renderToasts();
    act(() => toast.error("Couldn't save. Try again."));

    expect(screen.getByRole("alert").textContent).toContain("Couldn't save. Try again.");
    wait(30_000);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't save. Try again.");

    act(() => screen.getByRole("button", { name: "Close" }).click());
    wait(1_000);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["success", toast.success, 4_000],
    ["info", toast.info, 4_000],
    ["warning", toast.warning, 6_000],
  ] as const)("says a %s politely and closes it on its own", (kind, show, closesAfter) => {
    renderToasts();
    act(() => show("Display name saved."));
    wait(100);

    expect(shown()).toEqual([`${kind}: Display name saved.`]);
    expect(announced()).toBe("Display name saved.");
    expect(screen.queryByRole("alert")).toBeNull();
    wait(closesAfter - 500);
    expect(shown()).toHaveLength(1);
    wait(1_500);
    expect(shown()).toEqual([]);
  });

  it("gives each kind an icon, a different one for each kind that closes on its own", () => {
    renderToasts();
    act(() => {
      toast.success("Saved");
      toast.info("Heads up");
      toast.warning("Saved, but");
    });
    wait(500);
    const icons = [...document.querySelectorAll("[data-kind]")].map(
      (toast) => toast.querySelector("svg")?.outerHTML,
    );
    expect(icons).toHaveLength(3);
    expect(new Set(icons).size).toBe(3);
  });

  it("shows at most three at once, the newest always, even when three errors are open", () => {
    renderToasts();
    act(() => {
      toast.error("First");
      toast.error("Second");
      toast.error("Third");
    });
    wait(500);
    act(() => toast.success("Display name saved."));
    wait(500);
    expect(shown()).toEqual(["error: Second", "error: Third", "success: Display name saved."]);
  });

  it("makes room by closing the oldest toast that isn't an error, keeping open errors while it can", () => {
    renderToasts();
    act(() => {
      toast.error("First");
      toast.success("Second");
      toast.error("Third");
      toast.success("Fourth");
    });
    wait(500);
    expect(shown()).toEqual(["error: First", "error: Third", "success: Fourth"]);

    act(() => toast.info("Fifth"));
    wait(500);
    expect(shown()).toEqual(["error: First", "error: Third", "info: Fifth"]);
  });

  it("shows the same message once, however often it happens", () => {
    renderToasts();
    act(() => {
      toast.error("Couldn't sign out.");
      toast.error("Couldn't sign out.");
      toast.error("Couldn't sign out.");
    });
    wait(500);
    expect(shown()).toEqual(["error: Couldn't sign out."]);
  });
});
