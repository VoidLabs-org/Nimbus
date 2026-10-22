/**
 * A Project key suggested from its name: the initials of several words, or the first three letters of a single word,
 * in capitals, starting with a letter and at most ten characters. Empty when that would be shorter than the two
 * characters a key needs, so the form never suggests a key the server rejects.
 */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const suggestion =
    words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "").slice(0, 3);
  const key = suggestion.replace(/^[^A-Z]+/, "").slice(0, 10);
  return key.length >= 2 ? key : "";
}

/**
 * The key after the name changes from `previousName` to `name`: it follows the name while it is empty or still the
 * key the old name suggested, and is left alone once the User has typed their own.
 */
export function keyForName(previousName: string, name: string, key: string): string {
  return key === "" || key === suggestKey(previousName) ? suggestKey(name) : key;
}
