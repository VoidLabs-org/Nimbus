import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

/**
 * "‹ Sign in" at the top of a signed-out screen (design M4a, M4c). Goes back when there is a screen to go back to,
 * else (opened from Welcome, which is gone) to Sign in. `onPress` replaces that, as for a step within a screen.
 */
export function BackLink({ label, onPress }: { label: string; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.link}
      onPress={onPress ?? backToSignIn}
    >
      <Text
        weight="medium"
        size={16}
        style={{ color: theme.dark ? theme.colorAccent600 : theme.colorAccent700 }}
      >
        ‹ {label}
      </Text>
    </Pressable>
  );
}

export function backToSignIn() {
  if (router.canGoBack()) router.back();
  else router.replace("/sign-in");
}

const styles = StyleSheet.create({
  link: { height: 44, justifyContent: "center", alignSelf: "flex-start" },
});
