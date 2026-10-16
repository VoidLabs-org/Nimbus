import { Box, type BoxProps, type ElementProps } from "@mantine/core";

export type PanelProps = BoxProps & ElementProps<"div">;

/**
 * A rounded surface for grouping content, used instead of Mantine's Paper: frosted glass on Fog and Slate, solid
 * with a hairline edge on Paper and Ink. Its look comes only from the theme variables.
 */
export function Panel({ className, ...props }: PanelProps) {
  return <Box className={className ? `nimbus-panel ${className}` : "nimbus-panel"} {...props} />;
}
