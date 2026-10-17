import { usePlatformPermissions } from "../access/usePlatformPermissions";

/** A page a signed-in User can open from the navbar. `end` matches the path exactly (Home only). */
export type Destination = { to: string; label: string; end?: boolean };

/**
 * The pages a User may open, in navbar order: Home for everyone, Roles & access with `access:role:manage`, the
 * Audit log with `access:audit:view`. The one place that decides what the navbar offers.
 */
export function destinationsFor(platformPermissions: readonly string[]): Destination[] {
  const destinations: Destination[] = [{ to: "/", label: "Home", end: true }];
  if (platformPermissions.includes("access:role:manage"))
    destinations.push({ to: "/settings/roles", label: "Roles & access" });
  if (platformPermissions.includes("access:audit:view"))
    destinations.push({ to: "/settings/audit", label: "Audit log" });
  return destinations;
}

/** The signed-in User's destinations; only Home until their Permissions are known. */
export function useDestinations(): Destination[] {
  return destinationsFor(usePlatformPermissions());
}
