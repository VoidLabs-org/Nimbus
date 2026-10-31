import { type ComponentRef, useEffect, useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { fonts, useTheme } from "../theme";
import { Text } from "./Text";

/** Digits in a Verification code or a Reset code. */
export const CODE_LENGTH = 6;

type Props = {
  /** The field's accessible name, such as "Verification code". */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Called once the last digit is in, with the whole code. */
  onComplete?: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
};

/**
 * The six boxes for an emailed code (design M4b). One real field lies over the boxes, see-through, so typing, the
 * keyboard's suggested code and a long-press paste all fill it; anything but digits is dropped. The box for the next
 * digit is ringed in orange; a refused code rings them all red.
 */
export function CodeField({
  label,
  value,
  onChangeText,
  onComplete,
  invalid = false,
  disabled = false,
}: Props) {
  const theme = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const wasDisabled = useRef(disabled);

  // Turning the field off while a code is checked closes the keyboard; once it is back on (after a wrong code, say),
  // the keyboard comes back with it, so the next digits go in without a tap.
  useEffect(() => {
    if (wasDisabled.current && !disabled) input.current?.focus();
    wasDisabled.current = disabled;
  }, [disabled]);

  function change(text: string) {
    const code = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    onChangeText(code);
    if (code.length === CODE_LENGTH && code !== value) onComplete?.(code);
  }

  return (
    <Pressable style={styles.row} onPress={() => input.current?.focus()} disabled={disabled}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const next = !disabled && index === Math.min(value.length, CODE_LENGTH - 1);
        return (
          <View
            key={index}
            style={[
              styles.box,
              {
                backgroundColor: theme.card,
                borderColor: invalid
                  ? theme.toastError
                  : next
                    ? theme.colorAccent
                    : theme.lineStrong,
                borderWidth: invalid || next ? 2 : 1,
              },
              disabled && styles.dimmed,
            ]}
          >
            <Text weight="semibold" size={24}>
              {value[index] ?? ""}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH + 2}
        caretHidden
        style={[styles.input, { fontFamily: fonts.regular }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 7 },
  box: { flex: 1, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  // Over the boxes and see-through: it takes the touches and the text, the boxes show it.
  input: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: "transparent",
    opacity: 0.02,
  },
  dimmed: { opacity: 0.6 },
});
