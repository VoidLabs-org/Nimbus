import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NimbusThemeProvider, useNimbusTheme } from "./nimbus-theme";
import { stubMatchMedia } from "./test-support";

// jsdom has no matchMedia: answer the dark-mode query as the "system" would. afterEach puts the real one back.
function systemPrefers(scheme: "light" | "dark") {
  stubMatchMedia(scheme);
}

/** A page using the theme, as the navbar switches or the Appearance page will. */
function Consumer({ label }: { label: string }) {
  const { theme, mode, surface, followsSystem, setMode, setSurface, setTheme, followSystem } =
    useNimbusTheme();
  return (
    <div>
      <span data-testid={`${label}-theme`}>{theme}</span>
      <span data-testid={`${label}-settings`}>{`${mode} ${surface}`}</span>
      <span data-testid={`${label}-follows`}>{String(followsSystem)}</span>
      <button type="button" onClick={followSystem}>
        {label} follow system
      </button>
      <button type="button" onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
        {label} toggle dark
      </button>
      <button type="button" onClick={() => setSurface(surface === "glass" ? "flat" : "glass")}>
        {label} toggle glass
      </button>
      <button type="button" onClick={() => setTheme("fog")}>
        {label} pick fog
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <NimbusThemeProvider>
      <Consumer label="navbar" />
      <Consumer label="appearance" />
    </NimbusThemeProvider>,
  );
}

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute("data-theme");
  root().removeAttribute("data-mantine-color-scheme");
});

const realMatchMedia = window.matchMedia;

// Leave nothing behind for the next test: the real matchMedia (beforeEach clears the rest).
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

describe("NimbusThemeProvider", () => {
  it("follows the system's light setting on a first visit, with flat surfaces", () => {
    systemPrefers("light");
    renderApp();

    expect(screen.getByTestId("navbar-theme").textContent).toBe("paper");
    expect(root().getAttribute("data-theme")).toBe("paper");
    expect(root().getAttribute("data-mantine-color-scheme")).toBe("light");
  });

  it("follows the system's dark setting on a first visit", () => {
    systemPrefers("dark");
    renderApp();

    expect(screen.getByTestId("navbar-theme").textContent).toBe("ink");
    expect(root().getAttribute("data-theme")).toBe("ink");
    expect(root().getAttribute("data-mantine-color-scheme")).toBe("dark");
  });

  it("gives each pair of mode and surface its own theme", () => {
    systemPrefers("light");
    renderApp();
    const click = (name: string) => act(() => screen.getByText(name).click());

    click("navbar toggle glass");
    expect(root().getAttribute("data-theme")).toBe("fog");
    click("navbar toggle dark");
    expect(root().getAttribute("data-theme")).toBe("slate");
    expect(root().getAttribute("data-mantine-color-scheme")).toBe("dark");
    click("navbar toggle glass");
    expect(root().getAttribute("data-theme")).toBe("ink");
    click("navbar toggle dark");
    expect(root().getAttribute("data-theme")).toBe("paper");
    expect(root().getAttribute("data-mantine-color-scheme")).toBe("light");
  });

  it("keeps every page using it in agreement", () => {
    systemPrefers("light");
    renderApp();

    act(() => screen.getByText("appearance pick fog").click());

    expect(screen.getByTestId("navbar-settings").textContent).toBe("light glass");
    expect(screen.getByTestId("appearance-theme").textContent).toBe("fog");

    act(() => screen.getByText("navbar toggle dark").click());

    expect(screen.getByTestId("appearance-theme").textContent).toBe("slate");
  });

  it("remembers the choice after a reload, even when the system says otherwise", () => {
    systemPrefers("light");
    const first = renderApp();
    act(() => screen.getByText("navbar toggle dark").click());
    act(() => screen.getByText("navbar toggle glass").click());
    first.unmount();
    root().removeAttribute("data-theme");

    renderApp();

    expect(screen.getByTestId("navbar-theme").textContent).toBe("slate");
    expect(root().getAttribute("data-theme")).toBe("slate");
  });

  it("follows a choice made in another tab, and keeps it when this tab changes the other setting", () => {
    systemPrefers("light");
    renderApp();

    // Another tab picks Ink.
    localStorage.setItem("nimbus-theme", JSON.stringify({ mode: "dark", surface: "flat" }));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "nimbus-theme" }));
    });
    expect(root().getAttribute("data-theme")).toBe("ink");

    act(() => screen.getByText("navbar toggle glass").click());

    expect(root().getAttribute("data-theme")).toBe("slate");
    expect(JSON.parse(localStorage.getItem("nimbus-theme") ?? "{}")).toEqual({
      mode: "dark",
      surface: "glass",
    });
  });

  it("keeps another tab's choice when this tab hasn't heard about it yet", () => {
    systemPrefers("light");
    renderApp();

    // Another tab picks dark, but this tab missed the event (say it was asleep).
    localStorage.setItem("nimbus-theme", JSON.stringify({ mode: "dark" }));
    act(() => screen.getByText("navbar toggle glass").click());

    expect(JSON.parse(localStorage.getItem("nimbus-theme") ?? "{}")).toEqual({
      mode: "dark",
      surface: "glass",
    });
  });

  it("goes back to following the system's light or dark, keeping the chosen surface", () => {
    systemPrefers("dark");
    renderApp();
    expect(screen.getByTestId("navbar-follows").textContent).toBe("true");

    act(() => screen.getByText("appearance pick fog").click());
    expect(screen.getByTestId("navbar-follows").textContent).toBe("false");
    expect(root().getAttribute("data-theme")).toBe("fog");

    act(() => screen.getByText("appearance follow system").click());

    expect(screen.getByTestId("navbar-follows").textContent).toBe("true");
    expect(root().getAttribute("data-theme")).toBe("slate");
    expect(JSON.parse(localStorage.getItem("nimbus-theme") ?? "{}")).toEqual({ surface: "glass" });
  });

  it("starts from the defaults when the saved choice is unreadable", () => {
    systemPrefers("dark");
    localStorage.setItem("nimbus-theme", "not json");

    renderApp();

    expect(root().getAttribute("data-theme")).toBe("ink");
  });
});

describe("NimbusThemeProvider with flatOnly (the Desktop app)", () => {
  function renderFlatOnly() {
    return render(
      <NimbusThemeProvider flatOnly>
        <Consumer label="appearance" />
      </NimbusThemeProvider>,
    );
  }

  it("shows a saved glass theme flat: Slate as Ink, Fog as Paper", () => {
    systemPrefers("light");
    localStorage.setItem("nimbus-theme", JSON.stringify({ mode: "dark", surface: "glass" }));

    renderFlatOnly();

    expect(root().getAttribute("data-theme")).toBe("ink");
    expect(screen.getByTestId("appearance-settings").textContent).toBe("dark flat");
  });

  it("keeps light or dark from a glass pick, and stays flat", () => {
    systemPrefers("dark");
    renderFlatOnly();

    act(() => screen.getByRole("button", { name: "appearance pick fog" }).click());

    expect(root().getAttribute("data-theme")).toBe("paper");
  });
});
