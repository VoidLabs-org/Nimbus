import type { Icon, IconProps } from "@tabler/icons-react";

/** The one stroke weight every icon in Nimbus is drawn with. */
const STROKE = 1.5;

/**
 * The one way icons are drawn in Nimbus: a Tabler icon at one stroke weight, always `aria-hidden` because an icon is
 * decoration. A control that is only an icon must name itself (aria-label, or visible text beside it); this never
 * does. Import the icon by name from "@tabler/icons-react", never the whole library, and pass it as `icon`:
 *
 *     <Glyph icon={IconArrowRight} />
 *
 * The size defaults to 16; pass `size` only where an icon is meant to be another size.
 */
export function Glyph({
  icon: Component,
  size = 16,
  ...props
}: { icon: Icon; size?: number } & Omit<IconProps, "size" | "stroke" | "aria-hidden">) {
  return <Component size={size} stroke={STROKE} {...props} aria-hidden />;
}
