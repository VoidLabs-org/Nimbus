import { SegmentedControl, type SegmentedControlProps } from "@mantine/core";

/** Pill-shaped tabs, as on the Roles pages: the chosen tab is ink on the page colour. */
export function PillTabs(props: SegmentedControlProps) {
  return (
    <SegmentedControl
      radius="xl"
      size="md"
      classNames={{
        root: "nimbus-pill-tabs",
        indicator: "nimbus-pill-tabs-indicator",
        label: "nimbus-pill-tabs-label",
      }}
      {...props}
    />
  );
}
