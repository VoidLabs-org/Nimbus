import { Burger, Container, Group, Popover, Stack, Tooltip, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Glyph } from "@repo/ui/glyph";
import { ThemeToggles } from "@repo/ui/theme-toggles";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { UserMenu } from "../auth/UserMenu";
import { NotificationBell } from "../notifications/NotificationBell";
import classes from "./AppShell.module.css";
import { NimbusLogo } from "./NimbusLogo";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { OfflinePage } from "./StatusPages";
import { useOnline } from "./useOnline";
import { DESTINATIONS, type Destination } from "./navigation";
import {
  effectivePosition,
  isVertical,
  menuPlacement,
  NARROW_QUERY,
  takeNavFocus,
  useNavPosition,
} from "./navPosition";
import { useAnimatedPosition } from "./useAnimatedPosition";
import { useNavShortcut } from "./useNavShortcut";

/** A navbar link: highlighted, and announced as the current page, while it is open. */
export function DestinationLink({
  destination,
  onOpen,
}: {
  destination: Destination;
  onOpen?: () => void;
}) {
  return (
    <NavLink
      to={destination.to}
      end={destination.end}
      onClick={onOpen}
      data-nav-focus={destination.id}
      className={({ isActive }) => (isActive ? `${classes.link} ${classes.active}` : classes.link)}
    >
      {destination.label}
    </NavLink>
  );
}

/**
 * A link in the vertical rail: the destination's icon in a round button, named by a tooltip and an aria-label. The
 * link sits in a span the tooltip attaches to: Mantine's Tooltip merges its own class into its child, which would
 * replace the NavLink's function className (what marks the open page) and leave the link unstyled.
 */
export function RailLink({
  destination,
  side,
}: {
  destination: Destination;
  side: "left" | "right";
}) {
  return (
    <Tooltip label={destination.label} position={side === "left" ? "right" : "left"} withArrow>
      <span className={classes.railItem}>
        <NavLink
          to={destination.to}
          end={destination.end}
          aria-label={destination.label}
          data-nav-focus={destination.id}
          className={({ isActive }) =>
            isActive ? `${classes.railLink} ${classes.railActive}` : classes.railLink
          }
        >
          <Glyph icon={destination.icon} size={20} />
        </NavLink>
      </span>
    </Tooltip>
  );
}

/**
 * The open page, with the offline page over it while the browser has no connection, and the crashed page in its place
 * if it crashes while drawing. Either way the navbar stays. Offline, the page is hidden rather than removed, so
 * unsaved work on it (ticked Permissions, a half-filled window) is still there when the connection comes back.
 */
function PageContent() {
  const online = useOnline();
  const location = useLocation();
  return (
    <>
      {!online && <OfflinePage />}
      <div hidden={!online}>
        <PageErrorBoundary resetKey={location.key}>
          <Outlet />
        </PageErrorBoundary>
      </div>
    </>
  );
}

/**
 * Every signed-in page: the navbar, fixed to the edge the User chose (top, bottom, left or right), and the page in the
 * room it leaves. Top and bottom give the horizontal bar (links, the theme capsule and the account chip); left and
 * right turn it into a narrow rail of icons. Narrow screens always get the top bar, with the links and the theme
 * capsule folded into a menu next to the account chip. Changing the edge folds the bar into a corner and unfolds it
 * along the new one, like a snake going round the corner.
 */
export function AppShell() {
  // Starts the request (and caches it) on every signed-in page, so Settings lists its groups at once.
  usePlatformPermissions();
  const narrow = useMediaQuery(NARROW_QUERY, false, { getInitialValueInEffect: false });
  const [chosen] = useNavPosition();
  useNavShortcut(!narrow);
  // The edge actually drawn: it follows the chosen one round a corner (see useAnimatedPosition).
  const {
    shown: position,
    folded,
    corner,
  } = useAnimatedPosition(effectivePosition(chosen, narrow), narrow);
  const vertical = isVertical(position);
  const [menuOpen, setMenuOpen] = useState(false);
  // The burger menu only exists while narrow; leaving narrow closes it, so narrowing again doesn't open it unasked.
  if (!narrow && menuOpen) setMenuOpen(false);

  // The shortcut rebuilds the bar in the other layout, so the control that had focus is gone: give focus to the same
  // control there once the bar has settled.
  useEffect(() => {
    if (folded) return;
    const control = takeNavFocus();
    if (control) document.querySelector<HTMLElement>(`[data-nav-focus="${control}"]`)?.focus();
  }, [folded, position]);

  return (
    <div
      className={classes.shell}
      data-nav={position}
      data-folded={folded || undefined}
      data-corner={corner}
    >
      <nav className={classes.bar} aria-label="Main">
        {/* The logo the bar folds into while it moves; its contents fade out meanwhile. */}
        <span className={classes.pillLogo} aria-hidden>
          <NimbusLogo size={28} />
        </span>
        {/* Out of the tab order and the accessibility tree while folded; display: contents keeps the layout. */}
        <div className={classes.contents} inert={folded || undefined}>
          {vertical ? (
            <>
              <div className={classes.group}>
                <UnstyledButton
                  component={Link}
                  to="/"
                  className={classes.logoLink}
                  aria-label="Nimbus home"
                  data-nav-focus="brand"
                >
                  <NimbusLogo size={28} />
                </UnstyledButton>
                {DESTINATIONS.map((destination) => (
                  <RailLink
                    key={destination.id}
                    destination={destination}
                    side={position === "left" ? "left" : "right"}
                  />
                ))}
              </div>
              <div className={classes.group}>
                <ThemeToggles orientation="vertical" />
                <NotificationBell position={menuPlacement(position)} />
                <UserMenu compact placement={menuPlacement(position)} />
              </div>
            </>
          ) : (
            <>
              <UnstyledButton
                component={Link}
                to="/"
                className={classes.brand}
                data-nav-focus="brand"
              >
                <NimbusLogo size={24} />
                nimbus
              </UnstyledButton>
              {narrow ? (
                // Only rendered while narrow, so widening the window closes it instead of leaving it open, unanchored.
                // A popover, not a Menu, so Tab reaches the theme buttons as well as the links.
                <Popover
                  opened={menuOpen}
                  onChange={setMenuOpen}
                  position="bottom-end"
                  trapFocus
                  shadow="md"
                >
                  <Popover.Target>
                    <Burger
                      size="sm"
                      opened={menuOpen}
                      onClick={() => setMenuOpen((open) => !open)}
                      aria-label={menuOpen ? "Close the menu" : "Open the menu"}
                    />
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap={4}>
                      {DESTINATIONS.map((destination) => (
                        <DestinationLink
                          key={destination.id}
                          destination={destination}
                          onOpen={() => setMenuOpen(false)}
                        />
                      ))}
                      <Group mt="xs">
                        <ThemeToggles />
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              ) : (
                <>
                  <Group gap={4} wrap="nowrap">
                    {DESTINATIONS.map((destination) => (
                      <DestinationLink key={destination.id} destination={destination} />
                    ))}
                  </Group>
                  <Group ml={8}>
                    <ThemeToggles />
                  </Group>
                </>
              )}
              <NotificationBell position={menuPlacement(position)} />
              <UserMenu placement={menuPlacement(position)} />
            </>
          )}
        </div>
      </nav>
      <div className={classes.content}>
        <Container size="lg">
          <PageContent />
        </Container>
      </div>
    </div>
  );
}
