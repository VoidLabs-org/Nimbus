// Vite (and so Vitest) loads a file's text with a `?raw` import; the tests read stylesheets this way.
declare module "*?raw" {
  const text: string;
  export default text;
}
