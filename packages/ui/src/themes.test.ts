import { pageColours, themes } from "@repo/tokens";
import { describe, expect, it } from "vitest";
import stylesheet from "./themes.css?raw";

// The web app's themes live in themes.css as CSS variables; the Mobile app reads the same values from @repo/tokens.
// This reads the stylesheet the browser gets and checks that every variable of every theme is the token's value.

const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");

/** The variables of the one rule with exactly this selector. A second such rule would be missed, so it fails. */
function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  const rules = [...css.matchAll(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  if (rules.length !== 1)
    throw new Error(`themes.css has ${rules.length} ${selector} rules, expected 1`);
  return Object.fromEntries(
    [...rules[0]![1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]),
  );
}

const root = block(":root");

/** One theme as the browser computes it: the shared values, the theme's own on top, and var() references filled in
 *  from the theme itself, as often as they nest. */
function computed(name: string): Record<string, string> {
  const variables: Record<string, string> = { ...root, ...block(`:root[data-theme="${name}"]`) };
  const resolve = (value: string, seen: string[]): string =>
    value.replace(/var\((--[\w-]+)\)/g, (reference, ref: string) => {
      const target = variables[ref];
      if (target === undefined || seen.includes(ref)) return reference;
      return resolve(target, [...seen, ref]);
    });
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [key, resolve(value, [key])]),
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
