import { Button, createPolymorphicComponent, type ButtonProps } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { Glyph } from "./glyph";

/**
 * A page's or window's main action, as on sign-in: an orange pill with the label on the left and a round arrow on the
 * right. A Mantine `Button`, so it takes the same props, `component={Link} to="..."` included. Sized by the caller
 * through CSS variables on its `className`: `--arrow-button-height` (50px) and `--arrow-size` (34px).
 *
 *     <ArrowButton onClick={retry}>Try again</ArrowButton>
 */
export const ArrowButton = createPolymorphicComponent<"button", ButtonProps>(
  ({ className, ...props }: ButtonProps) => (
    <Button
      className={className ? `nimbus-arrow-button ${className}` : "nimbus-arrow-button"}
      rightSection={
        <span className="nimbus-arrow">
          <Glyph icon={IconArrowRight} />
        </span>
      }
      {...props}
    />
  ),
);
