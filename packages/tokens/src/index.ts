/**
 * The Nimbus theme values, shared by the web app (whose themes.css must match them; a test in packages/ui checks)
 * and the Mobile app. Names are the CSS variable names in camelCase: --color-accent-100 is colorAccent100.
 *
 * Paper (light, flat), Ink (dark, flat), Fog (light, glass) and Slate (dark, glass) come from the "Nimbus Themes"
 * design. Colours are CSS colour strings, which React Native also accepts. Shadows are CSS box-shadow strings, some
 * inset or in layers: React Native's boxShadow takes them on the New Architecture (Expo's default). panelBlur and the
 * blob values are for the web's glass and glow only.
 */

export type ThemeName = "paper" | "ink" | "fog" | "slate";

/** Each theme's page colour, also used for the theme picker's swatches. */
export const pageColours: Record<ThemeName, string> = {
  paper: "#ffffff",
  ink: "#121110",
  fog: "#eef0f3",
  slate: "#171b20",
};

/** What every theme starts from; each theme below overrides what it changes. */
const shared = {
  // Hovering a filled orange button goes lighter, so its dark text stays readable.
  accentHover: "#ff9468",

  colorAccent: "#ff6b3d",
  colorAccent100: "#ffefe7",
  colorAccent200: "#ffdccb",
  colorAccent300: "#ffbd9f",
  colorAccent400: "#ff9468",
  colorAccent500: "#ff6b3d",
  colorAccent600: "#e3532a",
  colorAccent700: "#a63d1c",
  colorAccent800: "#762c15",
  colorAccent900: "#47200f",

  colorAccent2: "#878381",
  colorAccent2100: "#f4f2f1",
  colorAccent2200: "#e6e3e1",
  colorAccent2300: "#cfcbc9",
  colorAccent2500: "#878381",
  colorAccent2700: "#57534f",
  colorAccent2800: "#3f3b38",

  colorBg: "#fff6ee",
  colorSurface: "#f7e9dc",
  card: "#ffffff",
  colorText: "#201d1a",
  colorDivider: "rgba(32, 30, 29, 0.16)",

  glass: "rgba(255, 255, 255, 0.5)",
  glassBorder: "rgba(255, 255, 255, 0.85)",
  glassShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 24px 60px rgba(118, 44, 21, 0.1)",
  seg: "rgba(32, 29, 26, 0.05)",
  rowHover: "rgba(255, 255, 255, 0.55)",
  line: "rgba(32, 29, 26, 0.07)",
  lineStrong: "rgba(32, 29, 26, 0.16)",
  blobO: 0.38,
  blob2: "#878381",
  blob2O: 0.28,
  blob3O: 0.22,
  scrim: "rgba(32, 29, 26, 0.3)",
  modalBg: "rgba(255, 248, 241, 0.82)",
  onAccent: "#201d1a",
  // Diff colours: added is green, removed is red, as people expect in a before → after list.
  diffAddedBg: "rgba(22, 163, 74, 0.13)",
  diffAddedFg: "#14532d",
  diffRemovedBg: "rgba(220, 38, 38, 0.1)",
  diffRemovedFg: "#7f1d1d",
  segOn: "#fff",
  segOnFg: "#201d1a",
  // Toast status icons, the same in every theme: green for done (not orange, which means "selected"), amber for a
  // caveat, red for a failure.
  toastSuccess: "#16a34a",
  toastSuccessFg: "#ffffff",
  toastWarning: "#f59e0b",
  toastWarningFg: "#201d1a",
  toastError: "#e5484d",
  toastErrorFg: "#ffffff",

  shadowSm: "0 1px 2px rgba(46, 43, 37, 0.14)",
  shadowMd: "0 3px 10px rgba(46, 43, 37, 0.16)",
  shadowLg: "0 12px 32px rgba(46, 43, 37, 0.22)",

  // Frosted panels on the glass themes only.
  panelBlur: "none",
};

export type Theme = typeof shared;

/** The dark themes' orange: lightened, so it reads on a dark page. */
const darkAccent = {
  colorAccent: "#ff6b3d",
  colorAccent100: "rgba(255, 107, 61, 0.16)",
  colorAccent200: "#4a2416",
  colorAccent300: "#8a3c1f",
  colorAccent400: "#c4542b",
  colorAccent500: "#ff6b3d",
  colorAccent600: "#ff8a63",
  colorAccent700: "#ffab8a",
  colorAccent800: "#ffc9b3",
  colorAccent900: "#ffece3",
  accentHover: "#ff8a63",
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  shadowMd: "0 6px 18px rgba(0, 0, 0, 0.45)",
  shadowLg: "0 24px 60px rgba(0, 0, 0, 0.55)",
  segOn: "rgba(255, 255, 255, 0.1)",
  diffAddedBg: "rgba(74, 222, 128, 0.14)",
  diffAddedFg: "#bbf7d0",
  diffRemovedBg: "rgba(248, 113, 113, 0.14)",
  diffRemovedFg: "#fecaca",
} satisfies Partial<Theme>;

export const themes: Record<ThemeName, Theme> = {
  paper: {
    ...shared,
    colorBg: pageColours.paper,
    colorSurface: "#f4f2ef",
    card: "#ffffff",
    colorText: "#1a1816",
    glass: "#ffffff",
    glassBorder: "rgba(26, 24, 22, 0.09)",
    glassShadow: "0 1px 2px rgba(26, 24, 22, 0.04)",
    seg: "rgba(26, 24, 22, 0.05)",
    rowHover: "rgba(26, 24, 22, 0.025)",
    line: "rgba(26, 24, 22, 0.07)",
    lineStrong: "rgba(26, 24, 22, 0.15)",
    blobO: 0,
    blob2O: 0,
    blob3O: 0,
    scrim: "rgba(26, 24, 22, 0.25)",
    modalBg: "#ffffff",
    onAccent: "#1a1816",
    segOn: "#ffffff",
    segOnFg: "#1a1816",
    shadowLg: "0 24px 60px rgba(26, 24, 22, 0.1)",
  },
  ink: {
    ...shared,
    ...darkAccent,
    colorBg: pageColours.ink,
    colorSurface: "#1c1a18",
    card: "#1c1a18",
    colorText: "#f3eee8",
    colorAccent2: "#8b8580",
    colorAccent2100: "rgba(255, 255, 255, 0.06)",
    colorAccent2200: "#2e2b28",
    colorAccent2300: "#45413d",
    colorAccent2500: "#9a948f",
    colorAccent2700: "#c9c3bd",
    colorAccent2800: "#e6e1dc",
    colorDivider: "rgba(255, 255, 255, 0.1)",
    glass: "#1a1816",
    glassBorder: "rgba(255, 255, 255, 0.08)",
    glassShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
    seg: "rgba(255, 255, 255, 0.05)",
    rowHover: "rgba(255, 255, 255, 0.03)",
    line: "rgba(255, 255, 255, 0.06)",
    lineStrong: "rgba(255, 255, 255, 0.14)",
    blobO: 0,
    blob2: "#000",
    blob2O: 0,
    blob3O: 0,
    scrim: "rgba(0, 0, 0, 0.6)",
    modalBg: "#1c1a18",
    onAccent: "#121110",
    segOnFg: "#f3eee8",
  },
  fog: {
    ...shared,
    colorBg: pageColours.fog,
    colorSurface: "#e2e6eb",
    card: "rgba(255, 255, 255, 0.85)",
    colorText: "#161a20",
    colorAccent2: "#6b7280",
    colorAccent2100: "#eef0f3",
    colorAccent2200: "#dde1e7",
    colorAccent2300: "#c3c9d2",
    colorAccent2500: "#6b7280",
    colorAccent2700: "#3f4652",
    colorAccent2800: "#2a303a",
    glass: "rgba(255, 255, 255, 0.62)",
    glassBorder: "rgba(255, 255, 255, 0.95)",
    glassShadow: "0 0 0 1px rgba(22, 26, 32, 0.05), 0 14px 36px rgba(22, 26, 32, 0.07)",
    seg: "rgba(22, 26, 32, 0.05)",
    rowHover: "rgba(22, 26, 32, 0.03)",
    line: "rgba(22, 26, 32, 0.07)",
    lineStrong: "rgba(22, 26, 32, 0.15)",
    blobO: 0.12,
    blob2: "#7aa2ff",
    blob2O: 0.22,
    blob3O: 0.1,
    scrim: "rgba(22, 26, 32, 0.25)",
    modalBg: "rgba(255, 255, 255, 0.9)",
    onAccent: "#161a20",
    segOn: "#ffffff",
    segOnFg: "#161a20",
    panelBlur: "blur(28px) saturate(1.5)",
  },
  slate: {
    ...shared,
    ...darkAccent,
    colorBg: pageColours.slate,
    colorSurface: "#20252c",
    card: "rgba(255, 255, 255, 0.06)",
    colorText: "#e9edf2",
    colorAccent2: "#7b8594",
    colorAccent2100: "rgba(255, 255, 255, 0.06)",
    colorAccent2200: "#2a313a",
    colorAccent2300: "#3d4651",
    colorAccent2500: "#959fad",
    colorAccent2700: "#c3cad4",
    colorAccent2800: "#e1e6ec",
    colorDivider: "rgba(255, 255, 255, 0.11)",
    glass: "rgba(200, 215, 235, 0.06)",
    glassBorder: "rgba(210, 225, 245, 0.11)",
    glassShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 24px 60px rgba(0, 0, 0, 0.35)",
    seg: "rgba(0, 0, 0, 0.25)",
    rowHover: "rgba(255, 255, 255, 0.04)",
    line: "rgba(255, 255, 255, 0.07)",
    lineStrong: "rgba(255, 255, 255, 0.16)",
    blobO: 0.14,
    blob2: "#7aa2ff",
    blob2O: 0.16,
    blob3O: 0.1,
    scrim: "rgba(8, 10, 12, 0.6)",
    modalBg: "rgba(30, 35, 42, 0.86)",
    onAccent: "#171b20",
    segOnFg: "#e9edf2",
    panelBlur: "blur(28px) saturate(1.5)",
  },
};

/**
 * The brand orange in 10 shades, lightest to darkest, built around #ff6b3d (shade 5): the light themes' accent scale
 * with one lighter tint in front. Mantine needs real colours to work out its tints.
 */
export const orange = [
  "#fff7f3",
  shared.colorAccent100,
  shared.colorAccent200,
  shared.colorAccent300,
  shared.colorAccent400,
  shared.colorAccent500,
  shared.colorAccent600,
  shared.colorAccent700,
  shared.colorAccent800,
  shared.colorAccent900,
] as const;

/** The brand font. Each app ships it, so there is no download; React Native takes this single name. */
export const fontFamily = "Poppins";

/** The web's font stack: Poppins, then the system font while it loads or if it is missing. */
export const webFontStack = `${fontFamily}, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

/** Corner radius in pixels for pill shapes: buttons and inputs. */
export const radius = { pill: 999 } as const;
