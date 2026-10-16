import { Checkbox, type CheckboxProps } from "@mantine/core";

/** A round check, orange when ticked, as in the Grants list. */
export function RoundCheck(props: CheckboxProps) {
  return <Checkbox radius="xl" size="md" iconColor="var(--on-accent)" {...props} />;
}
