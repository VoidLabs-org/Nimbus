import { radius, type Theme, themes } from "@repo/tokens";
import { useColorScheme } from "react-native";

/**
 * Poppins as `useFonts` registers it in the root layout: on a phone each weight is its own font, so a style names
 * the weight's font instead of setting `fontWeight`.
 */
export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
} as const;

export { radius };

/**
 * The Nimbus theme for this screen: Paper in light mode and Ink in dark, following the phone until Appearance lets
 * the User choose (#209). The glass themes, Fog and Slate, are web only.
 */
export function useTheme(): Theme & { dark: boolean } {
  const dark = useColorScheme() === "dark";
  return { ...themes[dark ? "ink" : "paper"], dark };
}
