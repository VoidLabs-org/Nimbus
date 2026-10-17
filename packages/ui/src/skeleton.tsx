import { Box, Skeleton, type BoxProps, type SkeletonProps } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";

/** How long a load must take before its skeleton shows, so a fast load doesn't flash one. */
const SHOW_AFTER_MS = 200;

/** One grey placeholder shape. Colours and the shimmer come from the theme (themes.css), so it reads in every theme. */
export function Bone({ className, ...props }: SkeletonProps) {
  return (
    <Skeleton
      className={className ? `nimbus-bone ${className}` : "nimbus-bone"}
      animate
      {...props}
    />
  );
}

/**
 * The area where content is on its way: marked busy at once, and drawing its skeleton (the children) only if the
 * load takes longer than about 200ms. The shapes are hidden from screen readers. Render it only while loading.
 */
export function Loading({ children, ...props }: BoxProps & { children: ReactNode }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Box aria-busy="true" {...props}>
      {late && <div aria-hidden="true">{children}</div>}
    </Box>
  );
}
