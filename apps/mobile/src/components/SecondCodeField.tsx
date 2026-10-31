import { CODE_LENGTH, CodeField } from "./CodeField";
import { TextField } from "./TextField";

type Props = {
  /** The Recovery code field instead of the Sign-in code boxes. */
  recovery: boolean;
  value: string;
  /** Called with what the User typed; the screen clears what it said about the refused code then. */
  onChangeText: (value: string) => void;
  /** Rings the field red, for a code the server refused. */
  refused: boolean;
  disabled: boolean;
  onSubmitEditing?: () => void;
};

/**
 * The second code of a Two-step sign-in or reset: the six boxes for a Sign-in code from the authenticator app, or the
 * field for a Recovery code (`xxxx-xxxx`, capitals and dashes ignored by the server).
 */
export function SecondCodeField({
  recovery,
  value,
  onChangeText,
  refused,
  disabled,
  onSubmitEditing,
}: Props) {
  if (recovery) {
    return (
      <TextField
        label="Recovery code"
        placeholder="xxxx-xxxx"
        value={value}
        onChangeText={onChangeText}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        maxLength={64}
        editable={!disabled}
        invalid={refused}
        onSubmitEditing={onSubmitEditing}
      />
    );
  }
  return (
    <CodeField
      label="Sign-in code"
      value={value}
      onChangeText={onChangeText}
      invalid={refused}
      disabled={disabled}
    />
  );
}

/**
 * Whether a second code can be sent: complete, and not the one just refused (sending that again would only spend a
 * try and count toward the hourly lock). A refused code's message goes as soon as the User changes it.
 */
export function secondCodeReady(recovery: boolean, value: string, refusedMessage: string | null) {
  if (refusedMessage !== null) return false;
  return recovery ? value.trim() !== "" : value.length === CODE_LENGTH;
}

/** The link that swaps one kind of second code for the other. */
export function switchSecondCodeLabel(recovery: boolean) {
  return recovery ? "Use your authenticator app" : "Use a recovery code";
}
