import { Group, SegmentedControl } from "@mantine/core";
import { themeNames, useNimbusTheme, type ThemeName } from "./nimbus-theme";

const labels: Record<ThemeName, string> = {
  paper: "Paper",
  ink: "Ink",
  fog: "Fog",
  slate: "Slate",
};

// Each theme's page colour, as its swatch.
const swatches: Record<ThemeName, string> = {
  paper: "#ffffff",
  ink: "#121110",
  fog: "#eef0f3",
  slate: "#171b20",
};

/** All four themes side by side, each with its swatch. Picking one sets both mode and surface. */
export function ThemePicker() {
  const { theme, setTheme } = useNimbusTheme();
  return (
    <SegmentedControl
      radius="xl"
      value={theme}
      onChange={(value) => setTheme(value as ThemeName)}
      classNames={{
        root: "nimbus-segmented",
        indicator: "nimbus-segmented-indicator",
        label: "nimbus-segmented-label",
      }}
      data={themeNames.map((name) => ({
        value: name,
        label: (
          <Group gap={8} wrap="nowrap">
            <span className="nimbus-swatch" style={{ background: swatches[name] }} />
            {labels[name]}
          </Group>
        ),
      }))}
    />
  );
}
