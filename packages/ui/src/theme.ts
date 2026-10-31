import {
  Button,
  createTheme,
  defaultVariantColorsResolver,
  PasswordInput,
  Select,
  TextInput,
  Title,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from "@mantine/core";
import { fontFamily, orange, radius } from "@repo/tokens";

// Brand orange from the tokens: Mantine needs real colours here to work out its tints; on the page, shades 1 to 9
// come from the theme's accent variables (orangeShades below).
const nimbus: MantineColorsTuple = [...orange];

// Filled orange buttons carry dark text: white on #ff6b3d is about 2.9:1, too faint to read comfortably. Hover
// goes lighter, not darker (--accent-hover, per theme), so the dark text stays readable. Any shade of the orange
// counts, such as "nimbus.6".
const variantColorResolver: VariantColorsResolver = (input) => {
  const colors = defaultVariantColorsResolver(input);
  const primary = input.theme.primaryColor;
  const orange = !input.color || input.color === primary || input.color.startsWith(`${primary}.`);
  if (input.variant === "filled" && orange) {
    return { ...colors, color: "var(--on-accent)", hover: "var(--accent-hover)" };
  }
  return colors;
};

// Mantine's orange shades follow the theme's accent variables, which Ink and Slate lighten for dark backgrounds,
// so c="nimbus.7" and var(--color-accent-700) are always the same colour.
const orangeShades = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((shade) => [
    `--mantine-color-nimbus-${shade}`,
    `var(--color-accent-${shade}00)`,
  ]),
);

/**
 * Points Mantine's own colours at the Nimbus theme variables (themes.css), so stock components (menus, modals,
 * inputs, tables, notifications) match whichever of Paper, Ink, Fog or Slate is chosen without styling each one.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => {
  const shared = {
    "--mantine-color-body": "var(--color-bg)",
    "--mantine-color-text": "var(--color-text)",
    "--mantine-color-dimmed": "var(--color-accent-2-500)",
    "--mantine-color-placeholder": "var(--color-accent-2-500)",
    "--mantine-color-default": "var(--card)",
    "--mantine-color-default-hover": "var(--row-hover)",
    "--mantine-color-default-color": "var(--color-text)",
    "--mantine-color-default-border": "var(--line-strong)",
    "--mantine-color-anchor": "var(--color-accent-700)",
    ...orangeShades,
  };
  return { variables: {}, light: shared, dark: shared };
};

const pill = `${radius.pill}px`;

// Shared Nimbus theme for the web app (and the Electron app later). Colours that change between Paper, Ink, Fog
// and Slate live in themes.css; this holds what is the same in all four.
export const theme = createTheme({
  primaryColor: "nimbus",
  primaryShade: 5,
  colors: { nimbus },
  variantColorResolver,
  fontFamily,
  headings: {
    fontFamily,
    fontWeight: "600",
  },
  defaultRadius: "xl",
  // Mantine draws its focus outline in the primary colour: a 2px orange ring on keyboard focus only.
  focusRing: "auto",
  components: {
    Button: Button.extend({ defaultProps: { radius: pill } }),
    TextInput: TextInput.extend({ defaultProps: { radius: pill } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { radius: pill } }),
    Select: Select.extend({ defaultProps: { radius: pill } }),
    Title: Title.extend({ styles: { root: { letterSpacing: "-0.02em" } } }),
  },
});
