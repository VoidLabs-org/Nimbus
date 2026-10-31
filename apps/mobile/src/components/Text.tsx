import { Text as NativeText, type TextProps } from "react-native";
import { fonts, useTheme } from "../theme";

type Props = TextProps & {
  weight?: keyof typeof fonts;
  /** The theme's quieter grey, for secondary lines. */
  muted?: boolean;
  size?: number;
};

/** Text in Poppins and the theme's text colour. Headings pass `weight="semibold"` and a larger `size`. */
export function Text({ weight = "regular", muted = false, size = 15, style, ...props }: Props) {
  const theme = useTheme();
  return (
    <NativeText
      {...props}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: size,
          color: muted ? theme.colorAccent2700 : theme.colorText,
          letterSpacing: weight === "semibold" && size >= 20 ? -0.02 * size : 0,
        },
        style,
      ]}
    />
  );
}
