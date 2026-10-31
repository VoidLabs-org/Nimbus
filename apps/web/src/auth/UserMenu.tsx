import { IconChevronDown } from "@tabler/icons-react";
import { Glyph } from "@repo/ui/glyph";
import { Menu, type FloatingPosition } from "@mantine/core";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { useState } from "react";
import { SignOutDialog } from "./SignOutDialog";
import classes from "./UserMenu.module.css";
import { useSession } from "./useSession";

/**
 * The signed-in User's chip in the navbar (avatar, first name, a down chevron; just the avatar in a vertical rail; avatar,
 * full name and email at the top of the Desktop app's Sidebar) and the compact menu it opens, towards the free side of
 * the window: their email and Sign out. Settings is a destination in
 * the navbar, not here. Sign out asks first. Signing out ends this browser's session only. Once it succeeds,
 * RequireUser sends the User to the sign-in page; this doesn't navigate itself.
 */
export function UserMenu({
  variant = "chip",
  placement = "bottom-end",
  offset = variant === "avatar" ? 32 : 10,
}: {
  /** "avatar" is just the picture, for a rail; "sidebar" adds the full name and email, filling the Sidebar's width. */
  variant?: "chip" | "avatar" | "sidebar";
  /** Which side of the chip the menu opens on; towards the free side of the window. */
  placement?: FloatingPosition;
  /** The gap between the chip and the menu. From the navbar's rail the menu must clear the bar itself, not just the avatar. */
  offset?: number;
}) {
  const { user } = useSession();
  const [confirming, setConfirming] = useState(false);
  if (!user) return null;

  return (
    <>
      <Menu
        position={placement}
        width={260}
        offset={offset}
        classNames={{ dropdown: classes.dropdown, item: classes.item, label: classes.label }}
      >
        <Menu.Target>
          <button
            type="button"
            className={variant === "chip" ? classes.chip : `${classes.chip} ${classes[variant]}`}
            data-nav-focus="account"
            aria-label={`Account menu for ${user.displayName}`}
          >
            <ProfilePicture
              name={user.displayName}
              src={user.avatarUrl}
              size={variant === "sidebar" ? 32 : 36}
            />
            {variant === "sidebar" && (
              <>
                <span className={classes.who}>
                  <span className={classes.fullName}>{user.displayName}</span>
                  <span className={classes.email}>{user.email}</span>
                </span>
                <span className={classes.chevron}>
                  <Glyph icon={IconChevronDown} size={14} />
                </span>
              </>
            )}
            {variant === "chip" && (
              <>
                <span className={classes.name}>{user.displayName.split(" ")[0]}</span>
                <span className={classes.chevron}>
                  <Glyph icon={IconChevronDown} size={14} />
                </span>
              </>
            )}
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label title={user.email}>{user.email}</Menu.Label>
          <Menu.Item onClick={() => setConfirming(true)}>Sign out</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <SignOutDialog opened={confirming} onClose={() => setConfirming(false)} />
    </>
  );
}
