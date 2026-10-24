import { Modal } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./WindowFrame.module.css";

/**
 * The window every dialog of the Roles pages shares (New Role, Rename Role, an Audit log entry): the blurred overlay,
 * the rounded window, a title (text or markup) with a ✕, and an optional line under it. What goes inside is up to
 * the caller.
 */
export function WindowFrame({
  opened,
  onClose,
  title,
  subtitle,
  withCloseButton = true,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: string;
  /** False hides the ✕, for a window the User must finish before it can close. */
  withCloseButton?: boolean;
  children: ReactNode;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={560}
      yOffset={24}
      title={title}
      withCloseButton={withCloseButton}
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
