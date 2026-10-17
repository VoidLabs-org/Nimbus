/** A page a signed-in User can open from the navbar. `end` matches the path exactly (Home only). */
export type Destination = { to: string; label: string; end?: boolean };

/**
 * The pages in the navbar's links: Home. Everything else (display name, password, Appearance, Roles & access and
 * the Audit log) is under Settings, which has its own button in the bar.
 */
export const DESTINATIONS: Destination[] = [{ to: "/", label: "Home", end: true }];
