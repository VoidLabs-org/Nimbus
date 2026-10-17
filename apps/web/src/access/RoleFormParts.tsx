import { Button, Group } from "@mantine/core";
import classes from "./NewRoleModal.module.css";

/** A field's label with a note, such as "Optional", on its right. */
export function FieldLabel({ name, note }: { name: string; note?: string }) {
  return (
    <>
      {name}
      {note && <span className={classes.note}>{note}</span>}
    </>
  );
}

/** The bottom row of a Role window: an optional note, Cancel and the submit button with its arrow. */
export function RoleFormFooter({
  note,
  submitLabel,
  loading,
  onCancel,
}: {
  note?: string;
  submitLabel: string;
  loading: boolean;
  onCancel: () => void;
}) {
  return (
    <div className={classes.footer}>
      <span className={classes.footerNote}>{note}</span>
      <Group gap={10}>
        <Button variant="default" className={classes.cancel} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={loading}
          className={classes.create}
          rightSection={
            <span className={classes.arrow} aria-hidden>
              →
            </span>
          }
        >
          {submitLabel}
        </Button>
      </Group>
    </div>
  );
}
