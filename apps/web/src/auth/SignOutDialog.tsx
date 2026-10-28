import { Button, Group, Modal, Text } from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { useSession } from "./useSession";

/**
 * "Sign out?", asked before signing out from the account menu or Jump: it says how the User signs back in, and signs
 * out on its button. While signing out it can't be closed; a failure says so and closes it.
 */
export function SignOutDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { user, logout } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      toast.error("Couldn't sign out. Check your connection and try again.");
      onClose();
      setSigningOut(false);
    }
  }

  if (!user) return null;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Sign out?"
      size={420}
      closeOnEscape={!signingOut}
      closeOnClickOutside={!signingOut}
      withCloseButton={!signingOut}
    >
      <Text size="sm" c="dimmed" mb="lg">
        {user.hasPassword
          ? "You'll need your email and password to sign back in."
          : "You'll sign back in with Google or GitHub."}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={signingOut}>
          Cancel
        </Button>
        <Button onClick={() => void signOut()} loading={signingOut}>
          Sign out
        </Button>
      </Group>
    </Modal>
  );
}
