/**
 * The mistakes in a typed display name that can be caught before sending it. The server stays the authority
 * (it also refuses invisible and direction-changing characters). Characters are counted the way the server
 * counts them, an emoji being one, which an input's `maxLength` cannot do: it counts UTF-16 units and would
 * refuse valid names and could cut an emoji in half.
 */
export function displayNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter your name";
  if ([...name].length > 100) return "Use at most 100 characters";
  return null;
}
