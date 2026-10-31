import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ProfilePicture } from "../../components/ProfilePicture";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { useSession } from "../../session/session";
import { useTheme } from "../../theme";

/**
 * Home (design M3d): who is signed in, and where Projects and Issues are for now. The unread count and the latest
 * Notifications come with #208. The User is read again from the API, so a new name shows; a Session that has ended
 * meanwhile surfaces here as "Your session expired".
 */
export default function Home() {
  const theme = useTheme();
  const { state, api } = useSession();
  const signedInAs = state.kind === "signedIn" ? state.user : null;
  // The time of day when Home opened; it stays put while the screen is up.
  const [opened] = useState(() => new Date());
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    initialData: signedInAs ?? undefined,
    initialDataUpdatedAt: 0,
  });

  if (!user) return null;
  return (
    <Screen>
      <View style={styles.header}>
        <ProfilePicture user={user} size={40} />
        <Text weight="semibold" size={26} accessibilityRole="header" style={styles.greeting}>
          {greeting(opened)}, {user.displayName}
        </Text>
      </View>
      <View style={[styles.note, { backgroundColor: theme.colorAccent100 }]}>
        <Text style={{ color: theme.colorAccent800 }}>
          Projects and issues are on the web for now. This app covers your account and
          notifications.
        </Text>
      </View>
    </Screen>
  );
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const styles = StyleSheet.create({
  header: { marginTop: 16, gap: 14 },
  greeting: { lineHeight: 32 },
  note: { borderRadius: 20, padding: 16 },
});
