import { UnstyledButton } from "@mantine/core";
import { useNimbusTheme } from "./nimbus-theme";

/**
 * The navbar's theme capsule (design variant 12b): a sun or moon button that switches light and dark, a divider,
 * and a glass button that turns orange while glass is on. Each button says whether it is on.
 */
export function ThemeToggles() {
  const { mode, surface, setMode, setSurface } = useNimbusTheme();
  const dark = mode === "dark";
  const glass = surface === "glass";
  return (
    <div className="nimbus-toggles">
      <UnstyledButton
        className="nimbus-toggle"
        aria-label="Dark mode"
        aria-pressed={dark}
        title="Light / dark"
        onClick={() => setMode(dark ? "light" : "dark")}
      >
        <span className={dark ? "nimbus-icon-moon" : "nimbus-icon-sun"} aria-hidden="true" />
      </UnstyledButton>
      <span className="nimbus-toggles-divider" aria-hidden="true" />
      <UnstyledButton
        className="nimbus-toggle nimbus-toggle-glass"
        aria-label="Glass"
        aria-pressed={glass}
        title="Glass"
        onClick={() => setSurface(glass ? "flat" : "glass")}
      >
        <span className="nimbus-icon-glass" aria-hidden="true" />
      </UnstyledButton>
    </div>
  );
}
