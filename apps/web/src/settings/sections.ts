import { usePlatformPermissions } from "../access/usePlatformPermissions";

/** The address parameter that opens Profile's password window. */
export const PASSWORD_PARAM = "password";

/**
 * Profile with the password window open: where the old Password page and "Set a password first" on the Security page
 * lead.
 */
export const PASSWORD_WINDOW_PATH = `/settings/profile?${PASSWORD_PARAM}`;

/** A page in Settings, with the line the overview shows under its name. */
export type SettingsItem = { to: string; label: string; description: string };

export type SettingsGroup = { label: "Account" | "Workspace"; items: SettingsItem[] };

const ACCOUNT: SettingsItem[] = [
  { to: "/settings/profile", label: "Profile", description: "Your name, email and password" },
  { to: "/settings/security", label: "Security", description: "Where you're signed in" },
  {
    to: "/settings/appearance",
    label: "Appearance",
    description: "Light or dark, flat or glass",
  },
];

/**
 * The Settings pages a User may open, grouped as the overview shows them: Account for everyone, Workspace (Roles &
 * access with `access:role:manage`, the Audit log with `access:audit:view`) only when there is something in it. The
 * one place that decides what Settings offers.
 */
export function settingsGroups(platformPermissions: readonly string[]): SettingsGroup[] {
  const workspace: SettingsItem[] = [];
  if (platformPermissions.includes("access:role:manage"))
    workspace.push({
      to: "/settings/roles",
      label: "Roles & access",
      description: "Roles and their Permissions",
    });
  if (platformPermissions.includes("access:audit:view"))
    workspace.push({
      to: "/settings/audit",
      label: "Audit log",
      description: "Every change to Roles and access",
    });
  const groups: SettingsGroup[] = [{ label: "Account", items: ACCOUNT }];
  if (workspace.length > 0) groups.push({ label: "Workspace", items: workspace });
  return groups;
}

/** The signed-in User's Settings groups; only Account until their Permissions are known. */
export function useSettingsGroups(): SettingsGroup[] {
  return settingsGroups(usePlatformPermissions());
}
