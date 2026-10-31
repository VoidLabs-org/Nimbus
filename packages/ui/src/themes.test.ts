import { pageColours, themes } from "@repo/tokens";
import { describe, expect, it } from "vitest";
import stylesheet from "./themes.css?raw";

// The web app's themes live in themes.css as CSS variables; the Mobile app reads the same values from @repo/tokens.
// This reads the stylesheet the browser gets and checks that every variable of every theme is the token's value.

const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`themes.css has no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
  );
}

const root = block(":root");

/** One theme as the browser computes it: the shared values, the theme's own on top, and var() references filled in. */
function computed(name: string): Record<string, string> {
  const variables = { ...root, ...block(`:root[data-theme="${name}"]`) };
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [
      key,
      value.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => root[ref] ?? ref),
    ]),
  );
}

const camel = (variable: string) =>
  variable.slice(2).replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

describe("themes.css and @repo/tokens", () => {
  it.each(["paper", "ink", "fog", "slate"] as const)("%s has exactly the token values", (name) => {
    const fromCss = Object.fromEntries(
      Object.entries(computed(name))
        .filter(([key]) => !key.startsWith("--theme-"))
        .map(([key, value]) => [camel(key), value]),
    );
    const fromTokens = Object.fromEntries(
      Object.entries(themes[name]).map(([key, value]) => [key, String(value)]),
    );

    expect(fromTokens).toEqual(fromCss);
  });

  it("each theme's page colour, used by the picker's swatches, is the token's", () => {
    expect({
      paper: root["--theme-paper-bg"],
      ink: root["--theme-ink-bg"],
      fog: root["--theme-fog-bg"],
      slate: root["--theme-slate-bg"],
    }).toEqual(pageColours);
  });
});
