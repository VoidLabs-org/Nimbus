/** Leaves the app with a full page load (to the API, which hands the browser on to a provider). A seam so tests can watch it. */
export function goTo(url: string): void {
  window.location.assign(url);
}
