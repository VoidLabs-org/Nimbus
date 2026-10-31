import { useState } from "react";
import { Button } from "../components/Button";
import { StatusScreen } from "../components/StatusScreen";
import { useSession } from "../session/session";

/** The stored Session couldn't be renewed because the phone has no connection (design M3f). Nothing is signed out. */
export default function Offline() {
  const { retry } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <StatusScreen
      bar="Offline"
      kicker="No connection"
      title="You’re offline."
      body="Nimbus needs a connection. Check Wi-Fi or mobile data, then try again."
    >
      <Button
        label="Try again"
        busy={busy}
        onPress={() => {
          setBusy(true);
          void retry().finally(() => setBusy(false));
        }}
      />
    </StatusScreen>
  );
}
