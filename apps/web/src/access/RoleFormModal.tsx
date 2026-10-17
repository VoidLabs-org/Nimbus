import { Button, Group, Modal } from "@mantine/core";
import type { ReactNode } from "react";
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

/** The frame both Role windows (New Role, Rename Role) share: the window, its title and the line under it. */
export function RoleFormModal({
  opened,
  onClose,
  title,
  subtitle,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={560}
      yOffset={24}
      title={title}
      classNames={{
        overlay: classes.overlay,
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
        close: classes.close,
      }}
    >
      {subtitle && <p className={classes.subtitle}>{subtitle}</p>}
      {children}
    </Modal>
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
