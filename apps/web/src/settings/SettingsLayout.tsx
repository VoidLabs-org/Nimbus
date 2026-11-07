import { Outlet, useLocation } from "react-router";
import { isWideSettingsPage } from "./sections";
import classes from "./SettingsLayout.module.css";
import { SettingsNav } from "./SettingsNav";
import { SettingsOverlayContext } from "./settingsOverlay";

/**
 * Settings in a browser, from the "Settings · 1440 wide" design: "Settings" on the left gutter with the list of its
 * pages under it (the same SettingsNav as the Desktop app's overlay), and the open page beside them. Forms sit in a
 * 720px column centred in that space; tables (see isWideSettingsPage) take all of it. The pages are told they are
 * beside the list, as in the overlay, so they drop the breadcrumbs the list stands in for.
 */
export default function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <div className={classes.layout}>
      <aside className={classes.side}>
        {/* Not a heading: each page's own title is the page's heading. */}
        <div className={classes.title}>Settings</div>
        <SettingsNav />
      </aside>
      <div className={classes.page} data-wide={isWideSettingsPage(pathname) || undefined}>
        <SettingsOverlayContext value="inside">
          <Outlet />
        </SettingsOverlayContext>
      </div>
    </div>
  );
}
