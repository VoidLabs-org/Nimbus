/** A Role key suggested from its name: lowercase letters, digits and underscores, starting with a letter. */
export function suggestKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 50);
}

/** The server's rule for a Role key, checked before submitting. */
export const ROLE_KEY = /^[a-z][a-z0-9_]{1,49}$/;

/**
 * The key after the name changes from `previousName` to `name`: it follows the name while it is empty or still the
 * key the old name suggested, and is left alone once the User has typed their own.
 */
export function keyForName(previousName: string, name: string, key: string): string {
  return key === "" || key === suggestKey(previousName) ? suggestKey(name) : key;
}

/** Whether the key is still the one suggested from the name (shown as "From name"). */
export function followsName(name: string, key: string): boolean {
  return key !== "" && key === suggestKey(name);
}
