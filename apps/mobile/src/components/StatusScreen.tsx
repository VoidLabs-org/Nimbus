import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { BrandBars } from "./BrandBars";
import { Logo, Screen } from "./Screen";
import { Text } from "./Text";

type Props = {
  /** The orange bar's word, such as "Offline" or "500". */
  bar?: string;
  kicker: string;
  title: string;
  body: string;
  children: ReactNode;
};

/** Session expired, offline and server error: the brand bars, what happened, and what to do (design M3e–M3g). */
export function StatusScreen({ bar, kicker, title, body, children }: Props) {
  const theme = useTheme();
  return (
    <Screen>
      <Logo />
      <View style={styles.spacer} />
      <BrandBars first={bar} />
      <View style={styles.text}>
        <Text
          weight="semibold"
          size={13}
          style={{ color: theme.dark ? theme.colorAccent600 : theme.colorAccent700 }}
        >
          {kicker}
        </Text>
        <Text weight="semibold" size={28} accessibilityRole="header">
          {title}
        </Text>
        <Text muted style={styles.body}>
          {body}
        </Text>
      </View>
      <View style={styles.spacer} />
      <View style={styles.actions}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
  text: { gap: 6, marginTop: 12 },
  body: { lineHeight: 22 },
  actions: { gap: 10 },
});
