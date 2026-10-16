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

// Brand orange: 10 shades, lightest to darkest, built around #ff6b3d (shade 5).
const nimbus: MantineColorsTuple = [
  "#fff7f3",
  "#ffefe7",
  "#ffdccb",
  "#ffbd9f",
  "#ff9468",
  "#ff6b3d",
  "#e3532a",
  "#a63d1c",
  "#762c15",
  "#47200f",
];

// Filled orange buttons carry dark text: white on #ff6b3d is about 2.9:1, too faint to read comfortably. Hover
// goes lighter, not darker, so the dark text stays readable.
const variantColorResolver: VariantColorsResolver = (input) => {
  const colors = defaultVariantColorsResolver(input);
  const primary = !input.color || input.color === input.theme.primaryColor;
  if (input.variant === "filled" && primary) {
    return { ...colors, color: "var(--on-accent)", hover: "var(--mantine-color-nimbus-4)" };
  }
  return colors;
};

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
  };
  return { variables: {}, light: shared, dark: shared };
};

const pill = "999px";

// Shared Nimbus theme for the web app (and the Electron app later). Colours that change between Paper, Ink, Fog
// and Slate live in themes.css; this holds what is the same in all four.
export const theme = createTheme({
  primaryColor: "nimbus",
  primaryShade: 5,
  colors: { nimbus },
  variantColorResolver,
  fontFamily: "Poppins, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  headings: {
    fontFamily:
      "Poppins, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
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
