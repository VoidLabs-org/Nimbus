import { Container, Tooltip, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Glyph } from "@repo/ui/glyph";
import { useNimbusTheme } from "@repo/ui/nimbus-theme";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { UserMenu } from "../auth/UserMenu";
import { PageContent } from "./AppShell";
import { modifierLabel, nimbusDesktop, type NimbusDesktop } from "./desktop";
import classes from "./DesktopShell.module.css";
import { DESTINATIONS, type Destination } from "./navigation";
import { NimbusLogo } from "./NimbusLogo";
import { AUTO_FOLD_QUERY, isFoldShortcut, useSidebarState } from "./sidebarState";

type Platform = NimbusDesktop["platform"];

/** Ctrl or ⌘ \ folds or opens the Sidebar, as the fold button does. */
function useFoldShortcut(platform: Platform, toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isFoldShortcut(event, platform)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform, toggle]);
}

/** Tells the window whether the theme is light or dark, so its own buttons (Windows) and menus match. */
function useWindowTheme() {
  const { mode } = useNimbusTheme();
  useEffect(() => {
    nimbusDesktop()?.setTheme(mode);
  }, [mode]);
}

/** A link in the open Sidebar: icon and name, filled while its page is open (Settings on every page under it). */
function SidebarRow({ destination }: { destination: Destination }) {
  return (
    <NavLink
      to={destination.to}
      end={destination.end}
      className={({ isActive }) => (isActive ? `${classes.row} ${classes.active}` : classes.row)}
    >
      <span className={classes.rowIcon}>
        <Glyph icon={destination.icon} size={18} />
      </span>
      {destination.label}
    </NavLink>
  );
}

/** The fold button: folds the open Sidebar, or opens the rail; its tooltip names the shortcut. */
function FoldButton({
  folded,
  platform,
  onClick,
}: {
  folded: boolean;
  platform: Platform;
  onClick: () => void;
}) {
  const label = folded ? "Open the Sidebar" : "Fold the Sidebar";
  return (
    <Tooltip label={`${label} (${modifierLabel(platform)} \\)`} position="right" withArrow>
      <UnstyledButton
        className={classes.foldButton}
        onClick={onClick}
        aria-label={label}
        aria-expanded={!folded}
      >
        <Glyph
          icon={folded ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse}
          size={18}
        />
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * The Desktop app's shell for every signed-in page (the browser gets AppShell's navbar instead): a Sidebar on the left
 * and the page beside it, under a title row the window is dragged by (Tabs will go there). The Sidebar is open (the account at its
 * top, then Home, Projects and Settings by name; Settings lists its own pages) or folded into a rail of icons with tooltips; the
 * fold button and Ctrl or ⌘ \ switch between them. The choice is kept on this computer. Under 960px wide the Sidebar
 * folds itself without changing the choice, and the button or shortcut opens it until the window is widened again.
 */
export default function DesktopShell() {
  const platform = nimbusDesktop()?.platform ?? "linux";
  // Starts the request (and caches it) on every signed-in page, so Settings lists its groups at once.
  usePlatformPermissions();
  const [chosen, setChosen] = useSidebarState();
  const narrow = useMediaQuery(AUTO_FOLD_QUERY, false, { getInitialValueInEffect: false });
  const [openWhileNarrow, setOpenWhileNarrow] = useState(false);
  // Opening it in a narrow window lasts until the window is widened; narrowing again folds it again.
  if (!narrow && openWhileNarrow) setOpenWhileNarrow(false);
  const folded = narrow ? !openWhileNarrow : chosen === "folded";
  const toggle = () => {
    if (narrow) setOpenWhileNarrow(!openWhileNarrow);
    else setChosen(folded ? "open" : "folded");
  };
  useFoldShortcut(platform, toggle);
  useWindowTheme();

  return (
    <div className={classes.shell} data-platform={platform} data-folded={folded || undefined}>
      <nav className={classes.sidebar} aria-label="Main">
        <div className={classes.sidebarTitle}>
          {!folded && <FoldButton folded={false} platform={platform} onClick={toggle} />}
        </div>
        {folded ? (
          <div className={classes.rail}>
            <Tooltip label="Home" position="right" withArrow>
              <UnstyledButton
                component={Link}
                to="/"
                className={classes.railLogo}
                aria-label="Nimbus home"
              >
                <NimbusLogo size={28} />
              </UnstyledButton>
            </Tooltip>
            <FoldButton folded platform={platform} onClick={toggle} />
            <UserMenu variant="avatar" placement="right-start" offset={14} />
            {/* The Notification bell goes here once Notifications exist. */}
            <div className={classes.bellSlot} data-slot="bell" />
            {DESTINATIONS.map((destination) => (
              <Tooltip key={destination.id} label={destination.label} position="right" withArrow>
                {/* A span for the tooltip: its class would replace the NavLink's (see AppShell's RailLink). */}
                <span className={classes.railItem}>
                  <NavLink
                    to={destination.to}
                    end={destination.end}
                    aria-label={destination.label}
                    className={({ isActive }) =>
                      isActive ? `${classes.railLink} ${classes.active}` : classes.railLink
                    }
                  >
                    <Glyph icon={destination.icon} size={20} />
                  </NavLink>
                </span>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className={classes.open}>
            <UnstyledButton component={Link} to="/" className={classes.brand}>
              <NimbusLogo size={24} />
              nimbus
            </UnstyledButton>
            <div className={classes.account}>
              <UserMenu variant="sidebar" placement="bottom-start" offset={8} />
              {/* The Notification bell goes here once Notifications exist. */}
              <div className={classes.bellSlot} data-slot="bell" />
            </div>
            {DESTINATIONS.map((destination) => (
              <SidebarRow key={destination.id} destination={destination} />
            ))}
          </div>
        )}
      </nav>
      <div className={classes.main}>
        {/* The window is dragged by this row; Tabs go here. */}
        <div className={classes.titleRow} />
        <div className={classes.content}>
          <Container size="lg">
            <PageContent />
          </Container>
        </div>
      </div>
    </div>
  );
}
