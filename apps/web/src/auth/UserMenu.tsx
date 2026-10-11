import { Button, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router";
import { useSession } from "./useSession";

/** The signed-in User's menu. Signing out ends this browser's session only. */
export function UserMenu() {
  const { user, logout } = useSession();
  const navigate = useNavigate();

  async function signOut() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      notifications.show({
        color: "red",
        message: "Couldn't sign out. Check your connection and try again.",
      });
    }
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button variant="subtle">{user?.displayName}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={signOut}>Sign out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
