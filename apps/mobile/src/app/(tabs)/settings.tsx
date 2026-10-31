import { NetworkError } from "@repo/api";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "../../components/Button";
import { ProfilePicture } from "../../components/ProfilePicture";
import { Screen } from "../../components/Screen";
import { Sheet } from "../../components/Sheet";
import { Text } from "../../components/Text";
import { useSession } from "../../session/session";
import { useTheme } from "../../theme";

/**
 * Settings (design M3h): who is signed in, which opens Profile, and Sign out behind a confirming sheet. Security,
 * Notifications and Appearance join with their tickets.
 */
export default function Settings() {
  const theme = useTheme();
  const { state, signOut, forget } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Why signing out didn't happen: no connection, or a server that failed.
  const [failure, setFailure] = useState<"offline" | "server" | null>(null);

  if (state.kind !== "signedIn") return null;
  const { user } = state;

  async function confirmSignOut() {
    setBusy(true);
    setFailure(null);
    try {
      await signOut();
    } catch (error) {
      setFailure(error instanceof NetworkError ? "offline" : "server");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text weight="semibold" size={28} accessibilityRole="header" style={styles.title}>
        Settings
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profile, ${user.displayName}, ${user.email}`}
        onPress={() => router.push("/profile")}
        style={({ pressed }) => [
          styles.account,
          { backgroundColor: pressed ? theme.seg : theme.card, borderColor: theme.line },
        ]}
      >
        <ProfilePicture user={user} size={48} />
        <View style={styles.who}>
          <Text weight="semibold">{user.displayName}</Text>
          <Text muted size={14}>
            {user.email}
          </Text>
        </View>
        <Text muted size={20}>
          ›
        </Text>
      </Pressable>
      <View style={styles.spacer} />
      <Button label="Sign out" variant="secondary" onPress={() => setConfirming(true)} />

      <Sheet open={confirming} onClose={() => setConfirming(false)}>
        <Text weight="semibold" size={22} accessibilityRole="header">
          Sign out?
        </Text>
        <Text muted style={styles.body}>
          You’ll need your email and password, or Google or GitHub, to sign back in on this phone.
        </Text>
        {failure ? (
          <Text size={13} accessibilityRole="alert" style={{ color: theme.toastError }}>
            {failure === "offline"
              ? "Can’t reach Nimbus, so you’re still signed in. Check your connection and try again."
              : "Nimbus couldn’t sign you out just now. Try again, or sign out on this phone only."}
          </Text>
        ) : null}
        <Button
          label="Sign out"
          variant="danger"
          busy={busy}
          onPress={() => void confirmSignOut()}
        />
        {failure === "server" ? (
          <Button
            label="Sign out on this phone only"
            variant="secondary"
            onPress={() => void forget()}
          />
        ) : null}
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
