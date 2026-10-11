import { Button, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useSession } from "./useSession";

/**
 * The signed-in User's menu. Signing out ends this browser's session only. Once it succeeds, RequireUser
 * sends the User to the sign-in page; this menu doesn't navigate itself.
 */
export function UserMenu() {
  const { user, logout } = useSession();
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
      setSigningOut(false);
    }
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button variant="subtle">{user?.displayName}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={signOut} disabled={signingOut}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
