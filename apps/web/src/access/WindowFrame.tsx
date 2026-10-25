import { Modal } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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
  fullScreenOnPhone = false,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: string;
  /** False hides the ✕, for a window the User must finish before it can close. */
  withCloseButton?: boolean;
  /** Fills a phone's screen, for a window that needs the room (positioning a photo). */
  fullScreenOnPhone?: boolean;
  children: ReactNode;
}) {
  const phone = useMediaQuery("(max-width: 36em)", false, { getInitialValueInEffect: false });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={560}
      yOffset={24}
      title={title}
      withCloseButton={withCloseButton}
      fullScreen={fullScreenOnPhone && phone}
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
