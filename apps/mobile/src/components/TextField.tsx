import type { ReactNode } from "react";
import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { fonts, radius, useTheme } from "../theme";
import { Text } from "./Text";

type Props = Omit<TextInputProps, "style"> & {
  label: string;
  /** Marks the field red; the message itself is shown by the form. */
  invalid?: boolean;
  /** Beside the label, such as "Forgot password?". */
  aside?: ReactNode;
};

/** A labelled pill field. The label is also the field's accessible name. */
export function TextField({ label, invalid = false, aside, ...input }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text weight="semibold" size={14}>
          {label}
        </Text>
        {aside}
      </View>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={theme.colorAccent2500}
        style={[
          styles.input,
          {
            backgroundColor: theme.card,
            color: theme.colorText,
            borderColor: invalid ? theme.toastError : theme.lineStrong,
            borderWidth: invalid ? 2 : 1,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  input: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
});
