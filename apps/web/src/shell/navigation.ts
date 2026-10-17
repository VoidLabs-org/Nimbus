import type { Icon } from "@tabler/icons-react";
import { IconHome, IconSettings } from "@tabler/icons-react";

/**
 * A page a signed-in User can open from the navbar. `end` matches the path exactly (Home only), so Settings, which has
 * no `end`, is highlighted on every page under it while Home isn't. The label is shown in the horizontal bar; the icon
 * stands for it in the vertical rail, which has no room for text. `id` names the control, so the keyboard focus can be
 * handed to the same one when the bar changes layout.
 */
export type Destination = {
  id: string;
  to: string;
  label: string;
  icon: Icon;
  end?: boolean;
};

/**
 * The names of the navbar's other controls that can hold keyboard focus (data-nav-focus in AppShell, UserMenu and the
 * theme switches). A destination's `id` must not be one of these, or the wrong control would get the focus back.
 */
export const OTHER_FOCUS_KEYS = ["brand", "account", "dark", "glass"] as const;

/**
 * The pages in the navbar's links: Home and Settings (display name, password, Appearance, Roles & access and the Audit
 * log are all under it). The account menu is about the person: their email and Sign out.
 */
export const DESTINATIONS: Destination[] = [
  { id: "home", to: "/", label: "Home", icon: IconHome, end: true },
  { id: "settings", to: "/settings", label: "Settings", icon: IconSettings },
];
