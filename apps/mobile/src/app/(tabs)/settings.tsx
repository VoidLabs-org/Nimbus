import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { ProfilePicture } from "../../components/ProfilePicture";
import { Screen } from "../../components/Screen";
import { Sheet } from "../../components/Sheet";
import { Text } from "../../components/Text";
import { useSession } from "../../session/session";
import { useTheme } from "../../theme";

/**
 * Settings (design M3h): who is signed in, and Sign out behind a confirming sheet. Profile, Security, Notifications and
 * Appearance join with their tickets.
 */
export default function Settings() {
  const theme = useTheme();
  const { state, signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (state.kind !== "signedIn") return null;
  const { user } = state;

  async function confirmSignOut() {
    setBusy(true);
    setFailed(false);
    try {
      await signOut();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text weight="semibold" size={28} accessibilityRole="header" style={styles.title}>
        Settings
      </Text>
      <View style={[styles.account, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <ProfilePicture user={user} size={48} />
        <View style={styles.who}>
          <Text weight="semibold">{user.displayName}</Text>
          <Text muted size={14}>
            {user.email}
          </Text>
        </View>
      </View>
      <View style={styles.spacer} />
      <Button label="Sign out" variant="secondary" onPress={() => setConfirming(true)} />

      <Sheet open={confirming} onClose={() => setConfirming(false)}>
        <Text weight="semibold" size={22} accessibilityRole="header">
          Sign out?
        </Text>
        <Text muted style={styles.body}>
          You’ll need your email and password, or Google or GitHub, to sign back in on this phone.
        </Text>
        {failed ? (
          <Text size={13} accessibilityRole="alert" style={{ color: theme.toastError }}>
            Can’t reach Nimbus, so you’re still signed in. Check your connection and try again.
          </Text>
        ) : null}
        <Button
          label="Sign out"
          variant="danger"
          busy={busy}
          onPress={() => void confirmSignOut()}
        />
        <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 16 },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  who: { flex: 1, gap: 2 },
  spacer: { flex: 1 },
  body: { lineHeight: 22 },
});
