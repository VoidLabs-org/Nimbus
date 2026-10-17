import type { ComponentPropsWithoutRef } from "react";

/** A small pill naming a state, such as a Role's kind, Built-in or Customised. */
export function Tag({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={className ? `nimbus-tag ${className}` : "nimbus-tag"} {...props} />;
}
