import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NimbusThemeProvider, useNimbusTheme } from "./nimbus-theme";

// jsdom has no matchMedia: answer the dark-mode query as the "system" would.
function systemPrefers(scheme: "light" | "dark") {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("prefers-color-scheme: dark") && scheme === "dark",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

/** A page using the theme, as the navbar switches or the Appearance page will. */
function Consumer({ label }: { label: string }) {
  const { theme, mode, surface, setMode, setSurface, setTheme } = useNimbusTheme();
  return (
    <div>
      <span data-testid={`${label}-theme`}>{theme}</span>
      <span data-testid={`${label}-settings`}>{`${mode} ${surface}`}</span>
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

afterEach(cleanup);

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

  it("starts from the defaults when the saved choice is unreadable", () => {
    systemPrefers("dark");
    localStorage.setItem("nimbus-theme", "not json");

    renderApp();

    expect(root().getAttribute("data-theme")).toBe("ink");
  });
});
