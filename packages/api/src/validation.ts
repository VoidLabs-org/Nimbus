// The mistakes in what a User types that can be caught before sending it. Each mirrors a server rule; the server stays
// the authority.

/**
 * A display name: present once trimmed, at most 100 characters (the server also refuses invisible and
 * direction-changing characters). Characters are counted the way the server counts them, an emoji being one, which a
 * field's `maxLength` cannot do: it counts UTF-16 units and would refuse valid names and could cut an emoji in half.
 */
export function displayNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter your name";
  if ([...name].length > 100) return "Use at most 100 characters";
  return null;
}

/** An email address, once trimmed: only its rough shape; the server checks the rest. */
export function emailError(value: string): string | null {
  return /^\S+@\S+\.\S+$/.test(value.trim()) ? null : "Enter a valid email address";
}

/** A new password: the length rule (8 to 128 characters). */
export function passwordError(value: string): string | null {
  return value.length < 8 || value.length > 128 ? "Use 8 to 128 characters" : null;
}
