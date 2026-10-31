import { StyleSheet, View } from "react-native";
import { radius, useTheme } from "../theme";
import { Text } from "./Text";

type Props = {
  /** The orange bar's word; the status screens put their kind here, such as "Offline" or "500". */
  first?: string;
};

/**
 * The three bars of the Nimbus mark: orange, ink and grey, each shorter than the last. They fill the first-launch
 * Welcome screen and the status screens (design option 1d); Sign in has none.
 */
export function BrandBars({ first = "Backlog" }: Props) {
  const theme = useTheme();
  const label = { color: theme.colorBg };
  return (
    <View
      style={styles.bars}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.bar, { width: "100%", backgroundColor: theme.colorAccent }]}>
        <View style={[styles.dot, { backgroundColor: theme.colorBg }]} />
        <Text weight="semibold" size={17.6} style={label}>
          {first}
        </Text>
      </View>
      <View style={[styles.bar, { width: "78%", backgroundColor: theme.colorText }]}>
        <Text weight="semibold" size={17.6} style={label}>
          to done,
        </Text>
      </View>
      <View style={[styles.bar, { width: "60%", backgroundColor: theme.colorAccent2 }]}>
        <Text weight="semibold" size={13.6} style={label}>
          with a little AI
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { gap: 12 },
  bar: {
    height: 58,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  dot: { width: 19, height: 19, borderRadius: 10 },
});
