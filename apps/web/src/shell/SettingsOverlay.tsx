import { FocusTrap, Overlay, Portal, UnstyledButton } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { IconX } from "@tabler/icons-react";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { NavLink } from "react-router";
import { useSettingsGroups } from "../settings/sections";
import { SettingsOverlayContext } from "../settings/settingsOverlay";
import classes from "./SettingsOverlay.module.css";

/** Another dialog is open over the overlay (a page's own, such as a Role's rename): Esc is that dialog's. */
function dialogAbove(): boolean {
  return document.querySelectorAll('[aria-modal="true"]').length > 1;
}

/**
 * Settings in the Desktop app, over the page the User was on, from the "Nimbus Desktop v2" design (2c), laid out like
 * the Claude app's Settings: a panel centred in the window over the dimmed, blurred app, with a header row (the title
 * and the ✕) above two columns. The Settings pages are listed on the left (Account for everyone, Workspace only for
 * Users who may open its pages, the same list as the Settings overview) and the open page, `children`, is on the
 * right; each column scrolls on its own, under the header. Esc, its ✕ and a click on the dimmed app call `onClose`;
 * Esc is left to a dialog open over it.
 *
 * Drawn by hand rather than as a Mantine Modal, whose own sizing fought the panel's: the layer centres it, Mantine's
 * Overlay dims the app and its FocusTrap keeps the keyboard inside. The pages' own dialogs (Mantine Modals) open above.
 */
export default function SettingsOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const groups = useSettingsGroups();
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || dialogAbove()) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Portal>
      <div className={classes.layer}>
        <Overlay
          fixed
          backgroundOpacity={0.45}
          blur={4}
          zIndex={0}
          onClick={onClose}
          data-settings-backdrop
        />
        <FocusTrap active>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-overlay-title"
            className={classes.panel}
          >
            <header className={classes.header}>
              <h2 id="settings-overlay-title" className={classes.title}>
                Settings
              </h2>
              <UnstyledButton
                className={classes.close}
                onClick={onClose}
                aria-label="Close Settings"
              >
                <Glyph icon={IconX} size={18} />
              </UnstyledButton>
            </header>
            <div className={classes.columns}>
              <nav aria-label="Settings pages" className={classes.list}>
                {groups.map((group) => (
                  <div key={group.label} className={classes.group}>
                    <div className={classes.heading}>{group.label}</div>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          isActive ? `${classes.item} ${classes.active}` : classes.item
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </nav>
              <div className={classes.page}>
                <SettingsOverlayContext value="inside">{children}</SettingsOverlayContext>
              </div>
            </div>
          </section>
        </FocusTrap>
      </div>
    </Portal>
  );
}
