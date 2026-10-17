/**
 * The mistakes in a typed new password that can be caught before sending it: the length rule (8 to 128 characters).
 * The server stays the authority.
 */
export function passwordError(value: string): string | null {
  return value.length < 8 || value.length > 128 ? "Use 8 to 128 characters" : null;
}
