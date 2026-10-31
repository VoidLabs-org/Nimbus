import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button } from "../components/Button";
import { Logo, Screen } from "../components/Screen";
import { Text } from "../components/Text";

/** Creating an account comes to the app with #202; until then this says where to do it. */
export default function Register() {
  return (
    <Screen>
      <Logo />
      <View style={styles.text}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          Create an account
        </Text>
        <Text muted style={styles.body}>
          Creating an account in the app is coming soon. For now, create one on the Nimbus website,
          then sign in here.
        </Text>
      </View>
      <View style={styles.spacer} />
      <Button label="Sign in" onPress={() => router.replace("/sign-in")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { marginTop: 24, gap: 6 },
  body: { lineHeight: 22 },
  spacer: { flex: 1 },
});
