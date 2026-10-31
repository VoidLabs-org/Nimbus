import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { radius, useTheme } from "../theme";
import { Text } from "./Text";

type Props = {
  label: string;
  onPress: () => void;
  /**
   * `primary` is the screen's main action: orange with dark text (white on this orange reads too faintly) and a round
   * arrow. `secondary` sits on the soft track; `danger` is red, for signing out.
   */
  variant?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
}: Props) {
  const theme = useTheme();
  const background = {
    primary: theme.colorAccent,
    secondary: theme.seg,
    danger: theme.toastError,
  }[variant];
  const color = {
    primary: theme.onAccent,
    secondary: theme.colorText,
    danger: theme.toastErrorFg,
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.arrowButton : styles.centred,
        { backgroundColor: pressed && variant === "primary" ? theme.accentHover : background },
        (disabled || busy) && styles.dimmed,
      ]}
    >
      <Text weight="semibold" size={variant === "primary" ? 16 : 15} style={{ color }}>
        {label}
      </Text>
      {variant === "primary" ? (
        <View style={[styles.arrow, { backgroundColor: theme.colorText }]}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.colorBg} />
          ) : (
            <Text weight="semibold" style={{ color: theme.colorBg }}>
              →
            </Text>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

/** A plain text action, such as "Create an account" under a form. Disabled, it is grey, as Resend while it counts. */
export function LinkButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
    >
      <Text
        weight="semibold"
        size={14}
        style={{
          color: disabled
            ? theme.colorAccent2700
            : theme.dark
              ? theme.colorAccent600
              : theme.colorAccent700,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 54, borderRadius: radius.pill, flexDirection: "row", alignItems: "center" },
  arrowButton: { justifyContent: "space-between", paddingLeft: 24, paddingRight: 8 },
  centred: { justifyContent: "center", paddingHorizontal: 24 },
  arrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  dimmed: { opacity: 0.6 },
});
