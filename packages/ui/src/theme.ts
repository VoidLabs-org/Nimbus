import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Brand color: 10 shades, lightest to darkest. Shade 6 is the main one.
const nimbus: MantineColorsTuple = [
  "#eaf3ff",
  "#d4e3ff",
  "#a6c4fb",
  "#75a3f8",
  "#4d87f5",
  "#3474f4",
  "#256af5",
  "#1859db",
  "#0c4fc4",
  "#0044ad",
];

// Shared Nimbus theme for the web app (and the Electron app later).
export const theme = createTheme({
  primaryColor: "nimbus",
  colors: { nimbus },
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  defaultRadius: "md",
});
