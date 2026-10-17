import type { Icon } from "@tabler/icons-react";
import { IconHome } from "@tabler/icons-react";

/**
 * A page a signed-in User can open from the navbar. `end` matches the path exactly (Home only). The label is shown
 * in the horizontal bar; the icon stands for it in the vertical rail, which has no room for text.
 */
export type Destination = { to: string; label: string; icon: Icon; end?: boolean };

/**
 * The pages in the navbar's links: Home. Everything else (display name, password, Appearance, Roles & access and
 * the Audit log) is under Settings, which is an item in the account menu.
 */
export const DESTINATIONS: Destination[] = [{ to: "/", label: "Home", icon: IconHome, end: true }];
