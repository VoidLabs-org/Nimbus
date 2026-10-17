import { useNimbusTheme } from "@repo/ui/nimbus-theme";

/**
 * The Nimbus icon for the current mode: the light logo has dark bars for light themes, the dark one cream bars for
 * dark themes. Decorative: it sits next to the "nimbus" wordmark.
 */
export function NimbusLogo({ size }: { size: number }) {
  const { mode } = useNimbusTheme();
  return (
    <img
      src={mode === "dark" ? "/nimbus-icon-dark.png" : "/nimbus-icon-light.png"}
      alt=""
      width={size}
      height={size}
    />
  );
}
