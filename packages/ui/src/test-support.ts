/**
 * Stands in for the browser's matchMedia, which jsdom lacks: the dark-mode query matches when the "system" prefers
 * dark, and nothing else matches (no reduced motion, no narrow window). Returns a function that puts the real one
 * back; call it after each test.
 */
export function stubMatchMedia(scheme: "light" | "dark" = "light"): () => void {
  const real = window.matchMedia;
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("prefers-color-scheme: dark") && scheme === "dark",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  return () => {
    window.matchMedia = real;
  };
}
