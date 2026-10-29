import { Button, Group, Modal, Text } from "@mantine/core";
import { useState } from "react";
import { PROVIDERS } from "./providers";
import { browserSignInBridge } from "./useBrowserSignIn";

/**
 * "Finish signing in in your browser", while the Desktop app waits for the browser to come back. Cancel (or Esc) gives
 * the sign-in up; "Open the browser again" is for a tab the User closed or lost.
 */
export function BrowserSignInWait({
  provider,
  connecting = false,
}: {
  /** The provider under way; null when nothing is. */
  provider: string | null;
  connecting?: boolean;
}) {
  // Kept while the window fades out, so it still names the provider.
  const [shown, setShown] = useState(provider);
  if (provider !== null && provider !== shown) setShown(provider);
  const name = PROVIDERS.find((known) => known.id === shown)?.name ?? "your provider";
  const cancel = () => browserSignInBridge()?.cancelProviderSignIn();

  return (
    <Modal
      opened={provider !== null}
      onClose={cancel}
      title={connecting ? "Finish connecting in your browser" : "Finish signing in in your browser"}
      size={420}
      centered
    >
      <Text size="sm" c="dimmed" mb="lg">
        {connecting
          ? `We opened ${name} in your browser. Sign in there to connect it, and you'll come back here.`
          : `We opened ${name} in your browser. Sign in there, and you'll come back here signed in.`}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={cancel}>
          Cancel
        </Button>
        <Button onClick={() => browserSignInBridge()?.reopenProviderSignIn()}>
          Open the browser again
        </Button>
      </Group>
    </Modal>
  );
}
