import { useState } from "react";
import { Button } from "../components/Button";
import { StatusScreen } from "../components/StatusScreen";
import { useSession } from "../session/session";

/**
 * The stored Session couldn't be renewed because the server failed (design M3g). Nothing is signed out, but the User
 * may leave: Sign out then forgets the Session on this phone, as the server can't be told.
 */
export default function ServerError() {
  const { retry, forget } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <StatusScreen
      bar="500"
      kicker="Error 500"
      title="Something went wrong on our side"
      body="It isn’t your connection. Try again in a moment."
    >
      <Button
        label="Try again"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void retry().finally(() => setBusy(false));
        }}
      />
      <Button label="Sign out" variant="secondary" onPress={() => void forget()} />
    </StatusScreen>
  );
}
