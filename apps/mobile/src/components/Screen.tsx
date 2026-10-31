import type { ReactNode } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Text } from "./Text";

const icons = {
  light: require("../../assets/images/nimbus-icon-light.png"),
  dark: require("../../assets/images/nimbus-icon-dark.png"),
};

/** The Nimbus icon and name, at the top of signed-out and status screens. */
export function Logo() {
  const theme = useTheme();
  return (
    <View style={styles.logo} accessible accessibilityLabel="Nimbus">
      <Image source={theme.dark ? icons.dark : icons.light} style={styles.icon} />
      <Text weight="bold" size={19}>
        nimbus
      </Text>
    </View>
  );
}

/** A whole screen on the theme's page colour, inside the phone's safe area. Forms scroll when the keyboard is up. */
export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const theme = useTheme();
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colorBg }]}>{body}</SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 18 },
  logo: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 28, height: 28 },
});
