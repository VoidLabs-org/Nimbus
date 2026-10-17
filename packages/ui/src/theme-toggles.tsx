import { UnstyledButton } from "@mantine/core";
import { IconBlur, IconMoon, IconSun } from "@tabler/icons-react";
import { Glyph } from "./glyph";
import { useNimbusTheme } from "./nimbus-theme";

/**
 * The navbar's theme capsule (design variant 12b): a sun or moon button that switches light and dark, a divider,
 * and a glass button that turns orange while glass is on. Each button says whether it is on.
 */
export function ThemeToggles({
  orientation = "horizontal",
}: {
  /** Vertical stacks the buttons, for the navbar rail. */
  orientation?: "horizontal" | "vertical";
}) {
  const { mode, surface, setMode, setSurface } = useNimbusTheme();
  const dark = mode === "dark";
  const glass = surface === "glass";
  return (
    <div className="nimbus-toggles" data-orientation={orientation}>
      <UnstyledButton
        className="nimbus-toggle"
        aria-label="Dark mode"
        data-nav-focus="dark"
        aria-pressed={dark}
        title="Light / dark"
        onClick={() => setMode(dark ? "light" : "dark")}
      >
        <Glyph icon={dark ? IconMoon : IconSun} />
      </UnstyledButton>
      <span className="nimbus-toggles-divider" aria-hidden="true" />
      <UnstyledButton
        className="nimbus-toggle nimbus-toggle-glass"
        aria-label="Glass"
        data-nav-focus="glass"
        aria-pressed={glass}
        title="Glass"
        onClick={() => setSurface(glass ? "flat" : "glass")}
      >
        <Glyph icon={IconBlur} />
      </UnstyledButton>
    </div>
  );
}
