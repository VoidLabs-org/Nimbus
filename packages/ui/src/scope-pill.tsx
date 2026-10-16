import { SegmentedControl, type SegmentedControlProps } from "@mantine/core";

/**
 * A small segmented choice on a soft track, such as a Grant's Own / Project / All Scope. The chosen option lifts
 * out of the track; the whole pill fades when disabled.
 */
export function ScopePill(props: SegmentedControlProps) {
  return (
    <SegmentedControl
      radius="xl"
      size="xs"
      classNames={{
        root: "nimbus-segmented",
        indicator: "nimbus-segmented-indicator",
        label: "nimbus-segmented-label",
      }}
      {...props}
    />
  );
}
