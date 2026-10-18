/**
 * A Project key suggested from its name: the initials of several words, or the first three letters of a single word,
 * in capitals, starting with a letter and at most ten characters.
 */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const suggestion =
    words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "").slice(0, 3);
  return suggestion.replace(/^[^A-Z]+/, "").slice(0, 10);
}
