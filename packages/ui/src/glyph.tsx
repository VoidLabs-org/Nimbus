import type { Icon, IconProps } from "@tabler/icons-react";

/**
 * The one way icons are drawn in Nimbus: a Tabler icon at one stroke weight, `aria-hidden` because an icon is
 * decoration. A control that is only an icon must name itself (aria-label, or visible text beside it); this never
 * does. Import the icon by name from "@tabler/icons-react", never the whole library, and pass it as `icon`:
 *
 *     <Glyph icon={IconArrowRight} />
 */
export function Glyph({
  icon: Component,
  size = 16,
  stroke = 2,
  ...props
}: { icon: Icon } & Omit<IconProps, "stroke" | "size"> & { size?: number; stroke?: number }) {
  return <Component size={size} stroke={stroke} aria-hidden {...props} />;
}
