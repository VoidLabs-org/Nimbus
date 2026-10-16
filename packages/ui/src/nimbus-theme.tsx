import { MantineProvider } from "@mantine/core";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { cssVariablesResolver, theme as mantineTheme } from "./theme";

export type Mode = "light" | "dark";

export type Surface = "flat" | "glass";

/** Light + flat is Paper, dark + flat is Ink, light + glass is Fog, dark + glass is Slate. */
export type ThemeName = "paper" | "ink" | "fog" | "slate";

export const themeNames: readonly ThemeName[] = ["paper", "ink", "fog", "slate"];

export function themeOf(mode: Mode, surface: Surface): ThemeName {
  if (mode === "light") return surface === "flat" ? "paper" : "fog";
  return surface === "flat" ? "ink" : "slate";
}

export function settingsOf(theme: ThemeName): { mode: Mode; surface: Surface } {
  return {
    mode: theme === "paper" || theme === "fog" ? "light" : "dark",
    surface: theme === "paper" || theme === "ink" ? "flat" : "glass",
  };
}

/**
 * The browser storage key. The pre-paint script in the web app's index.html reads the same key, so a reload
 * shows the saved theme straight away; keep the two in step.
 */
export const THEME_STORAGE_KEY = "nimbus-theme";

/** Only what the User chose: a mode never chosen keeps following the system. */
type Chosen = { mode?: Mode; surface?: Surface };

function readChosen(): Chosen {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    return {
      mode: saved.mode === "light" || saved.mode === "dark" ? saved.mode : undefined,
      surface: saved.surface === "flat" || saved.surface === "glass" ? saved.surface : undefined,
    };
  } catch {
    // Unreadable or blocked storage: start from the defaults.
    return {};
  }
}

function writeChosen(chosen: Chosen) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(chosen));
  } catch {
    // Blocked storage (private window, quota): the choice lasts until the page closes.
  }
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemMode(): Mode {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

type NimbusTheme = {
  mode: Mode;
  surface: Surface;
  theme: ThemeName;
  setMode: (mode: Mode) => void;
  setSurface: (surface: Surface) => void;
  /** Sets both settings at once. */
  setTheme: (theme: ThemeName) => void;
};

const NimbusThemeContext = createContext<NimbusTheme | null>(null);

/**
 * The one place that decides the theme: it remembers the User's choices in the browser, sets `data-theme` on the
 * document (which selects the variables in themes.css) and makes Mantine's light/dark follow the mode. Until the
 * User picks a mode, it follows the system's setting, live.
 */
export function NimbusThemeProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<Chosen>(readChosen);
  const [system, setSystem] = useState<Mode>(systemMode);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const follow = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const mode = chosen.mode ?? system;
  const surface = chosen.surface ?? "flat";
  const theme = themeOf(mode, surface);

  // Before paint, so a switch never shows the old theme's variables for a frame.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function choose(next: Chosen) {
    setChosen((current) => {
      const merged = { ...current, ...next };
      writeChosen(merged);
      return merged;
    });
  }

  const value: NimbusTheme = {
    mode,
    surface,
    theme,
    setMode: (next) => choose({ mode: next }),
    setSurface: (next) => choose({ surface: next }),
    setTheme: (next) => choose(settingsOf(next)),
  };

  return (
    <NimbusThemeContext.Provider value={value}>
      <MantineProvider
        theme={mantineTheme}
        cssVariablesResolver={cssVariablesResolver}
        forceColorScheme={mode}
      >
        <ThemeGlow />
        {children}
      </MantineProvider>
    </NimbusThemeContext.Provider>
  );
}

/** The current theme and the two settings behind it. Use it inside NimbusThemeProvider. */
export function useNimbusTheme(): NimbusTheme {
  const theme = useContext(NimbusThemeContext);
  if (!theme) throw new Error("useNimbusTheme must be used inside NimbusThemeProvider");
  return theme;
}

/** The soft glow behind every page; themes.css shows it only on the glass themes, Fog and Slate. */
function ThemeGlow() {
  return (
    <div className="nimbus-glow" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
