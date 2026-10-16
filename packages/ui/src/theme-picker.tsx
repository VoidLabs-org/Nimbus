import { Group, SegmentedControl } from "@mantine/core";
import { themeNames, useNimbusTheme, type ThemeName } from "./nimbus-theme";

type Choice = ThemeName | "system";

const labels: Record<Choice, string> = {
  system: "System",
  paper: "Paper",
  ink: "Ink",
  fog: "Fog",
  slate: "Slate",
};

const choices: readonly Choice[] = ["system", ...themeNames];

/**
 * System and the four themes side by side, each with its swatch. A theme sets both mode and surface; System
 * makes light or dark follow the system's setting again and keeps the surface (flat or glass) as it is.
 */
export function ThemePicker() {
  const { theme, followsSystem, setTheme, followSystem } = useNimbusTheme();
  return (
    <SegmentedControl
      radius="xl"
      value={followsSystem ? "system" : theme}
      onChange={(value) => (value === "system" ? followSystem() : setTheme(value as ThemeName))}
      classNames={{
        root: "nimbus-segmented",
        indicator: "nimbus-segmented-indicator",
        label: "nimbus-segmented-label",
      }}
      data={choices.map((choice) => ({
        value: choice,
        label: (
          <Group gap={8} wrap="nowrap">
            {/* The theme's page colour (half light, half dark for System), from themes.css. */}
            <span className="nimbus-swatch" data-swatch={choice} />
            {labels[choice]}
          </Group>
        ),
      }))}
    />
  );
}
