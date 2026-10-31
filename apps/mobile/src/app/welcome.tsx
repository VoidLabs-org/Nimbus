import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BrandBars } from "../components/BrandBars";
import { Button } from "../components/Button";
import { Logo, Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { useSession } from "../session/session";

/** The first launch only (design M3w): the brand bars, then Sign in or Create an account. */
export default function Welcome() {
  const { markWelcomed } = useSession();

  function go(to: "/sign-in" | "/register") {
    // Leaving Welcome for good: from now on the app opens on Sign in. Navigating first, so Welcome's guard closing
    // doesn't send the app to Sign in on its own.
    router.replace(to);
    markWelcomed();
  }

  return (
    <Screen>
      <Logo />
      <View style={styles.spacer} />
      <BrandBars />
      <Text weight="semibold" size={28} style={styles.pitch} accessibilityRole="header">
        Projects, issues, boards and sprints for small teams.
      </Text>
      <View style={styles.spacer} />
      <View style={styles.actions}>
        <Button label="Sign in" onPress={() => go("/sign-in")} />
        <Button label="Create an account" variant="secondary" onPress={() => go("/register")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
  pitch: { marginTop: 12, lineHeight: 32 },
  actions: { gap: 10 },
});
