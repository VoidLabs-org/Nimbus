/**
 * How a Recovery code box behaves wherever one is typed. Not "one-time-code": that offers the 6-digit codes from
 * messages and apps, never a Recovery code. 64 characters is the most the server takes; anything longer is never one.
 */
export const recoveryCodeInputProps = {
  label: "Recovery code",
  placeholder: "xxxx-xxxx",
  autoComplete: "off",
  autoCapitalize: "none",
  spellCheck: false,
  maxLength: 64,
} as const;
