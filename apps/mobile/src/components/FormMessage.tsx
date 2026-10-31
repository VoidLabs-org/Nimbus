import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

type Props = {
  message: string;
  /**
   * `error` is red and announced as an alert; `notice` is news with a tick, such as "New code sent"; `hint` is a quiet
   * line under a field, such as "8 to 128 characters".
   */
  kind?: "error" | "notice" | "hint";
  /** In line with a pill field's text. */
  indent?: boolean;
};

/** A line under a field or a form. */
export function FormMessage({ message, kind = "error", indent = false }: Props) {
  const theme = useTheme();
  const error = kind === "error";
  const color = error ? theme.toastError : theme.colorAccent2700;
  return (
    <View style={[styles.row, indent && styles.indent]}>
      {kind === "notice" ? (
        <Text
          size={13}
          weight="semibold"
          style={{ color: theme.toastSuccess }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          ✓
        </Text>
      ) : null}
      <Text
        size={13}
        accessibilityRole={error ? "alert" : undefined}
        accessibilityLiveRegion={kind === "hint" ? "none" : "polite"}
        style={[styles.text, { color }]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  indent: { paddingLeft: 20 },
  text: { flexShrink: 1 },
});
