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
