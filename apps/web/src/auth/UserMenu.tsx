import { Avatar, Button, Group, Menu, Modal, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router";
import classes from "./UserMenu.module.css";
import { useSession } from "./useSession";

/**
 * The signed-in User's chip in the navbar (avatar, first name, ▾) and the compact menu it opens: their email,
 * Settings and Sign out. Sign out asks first. Signing out ends this browser's session only. Once it succeeds,
 * RequireUser sends the User to the sign-in page; this doesn't navigate itself.
 */
export function UserMenu() {
  const { user, logout } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      notifications.show({
        color: "red",
        message: "Couldn't sign out. Check your connection and try again.",
      });
      setConfirming(false);
      setSigningOut(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <Menu
        position="bottom-end"
        width={240}
        offset={10}
        classNames={{ dropdown: classes.dropdown, item: classes.item, label: classes.label }}
      >
        <Menu.Target>
          <button
            type="button"
            className={classes.chip}
            aria-label={`Account menu for ${user.displayName}`}
          >
            {/* Falls back to initials of the name when there is no image, or it fails to load. No referrer:
                Google's image host refuses some requests that carry one. */}
            <Avatar
              src={user.avatarUrl}
              imageProps={{ referrerPolicy: "no-referrer" }}
              name={user.displayName}
              color="initials"
              size={36}
            />
            <span className={classes.name}>{user.displayName.split(" ")[0]}</span>
            <span className={classes.chevron} aria-hidden>
              ▾
            </span>
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{user.email}</Menu.Label>
          <Menu.Item component={Link} to="/settings">
            Settings
          </Menu.Item>
          <Menu.Item onClick={() => setConfirming(true)}>Sign out</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out?"
        size={420}
        closeOnEscape={!signingOut}
        closeOnClickOutside={!signingOut}
        withCloseButton={!signingOut}
      >
        <Text size="sm" c="dimmed" mb="lg">
          You&apos;ll need your email and password to sign back in.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirming(false)} disabled={signingOut}>
            Cancel
          </Button>
          <Button onClick={signOut} loading={signingOut}>
            Sign out
          </Button>
        </Group>
      </Modal>
    </>
  );
}
