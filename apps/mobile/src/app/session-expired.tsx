import { Button } from "../components/Button";
import { StatusScreen } from "../components/StatusScreen";
import { useSession } from "../session/session";

/** The Session ended while the app had it (design M3e). Signing in again returns to where the User was. */
export default function SessionExpired() {
  const { signInAgain } = useSession();
  return (
    <StatusScreen
      kicker="Signed out"
      title="Your session expired."
      body="For your security, please sign in again. You stay signed in for 30 days on this phone when you use the app."
    >
      <Button label="Sign in again" onPress={signInAgain} />
    </StatusScreen>
  );
}
