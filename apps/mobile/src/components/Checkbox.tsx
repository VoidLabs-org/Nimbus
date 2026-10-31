import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** A ticked or unticked line, such as "Remember this device for 30 days"; the whole line takes the tap. */
export function Checkbox({ label, checked, onChange, disabled = false }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={6}
      style={[styles.row, disabled && styles.dimmed]}
    >
      <View
        style={[
          styles.box,
          checked
            ? { backgroundColor: theme.colorAccent, borderColor: theme.colorAccent }
            : { backgroundColor: theme.card, borderColor: theme.lineStrong },
        ]}
      >
        {checked ? (
          <Text weight="bold" size={14} style={{ color: theme.onAccent }}>
            ✓
          </Text>
        ) : null}
      </View>
      <Text size={14} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1 },
  dimmed: { opacity: 0.6 },
});
