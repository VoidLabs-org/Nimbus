import { Burger, Group, Popover, Stack, Tooltip, UnstyledButton, Container } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Glyph } from "@repo/ui/glyph";
import { ThemeToggles } from "@repo/ui/theme-toggles";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { UserMenu } from "../auth/UserMenu";
import classes from "./AppShell.module.css";
import { NimbusLogo } from "./NimbusLogo";
import { DESTINATIONS, type Destination } from "./navigation";
import { effectivePosition, isVertical, menuPlacement, useNavPosition } from "./navPosition";
import { useAnimatedPosition } from "./useAnimatedPosition";
import { useNavShortcut } from "./useNavShortcut";

/** Below Mantine's `md` breakpoint the links and the theme capsule fold into a menu. */
const NARROW = "(max-width: 61.99em)";

/** A navbar link: highlighted, and announced as the current page, while it is open. */
function DestinationLink({
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
function RailLink({ destination, side }: { destination: Destination; side: "left" | "right" }) {
  return (
    <Tooltip label={destination.label} position={side === "left" ? "right" : "left"} withArrow>
      <span className={classes.railItem}>
        <NavLink
          to={destination.to}
          end={destination.end}
          aria-label={destination.label}
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
 * Every signed-in page: the navbar, fixed to the edge the User chose (top, bottom, left or right), and the page in the
 * room it leaves. Top and bottom give the horizontal bar (links, the theme capsule and the account chip); left and
 * right turn it into a narrow rail of icons. Narrow screens always get the top bar, with the links and the theme
 * capsule folded into a menu next to the account chip. Changing the edge folds the bar into a corner and unfolds it
 * along the new one, like a snake going round the corner.
 */
export function AppShell() {
  // Starts the request (and caches it) on every signed-in page, so Settings lists its groups at once.
  usePlatformPermissions();
  const narrow = useMediaQuery(NARROW, false, { getInitialValueInEffect: false });
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
        {vertical ? (
          <>
            <div className={classes.group}>
              <UnstyledButton
                component={Link}
                to="/"
                className={classes.logoLink}
                aria-label="Nimbus home"
              >
                <NimbusLogo size={28} />
              </UnstyledButton>
              {DESTINATIONS.map((destination) => (
                <RailLink
                  key={destination.to}
                  destination={destination}
                  side={position === "left" ? "left" : "right"}
                />
              ))}
            </div>
            <div className={classes.group}>
              <ThemeToggles orientation="vertical" />
              <UserMenu compact placement={menuPlacement(position)} />
            </div>
          </>
        ) : (
          <>
            <UnstyledButton component={Link} to="/" className={classes.brand}>
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
                        key={destination.to}
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
                    <DestinationLink key={destination.to} destination={destination} />
                  ))}
                </Group>
                <Group ml={8}>
                  <ThemeToggles />
                </Group>
              </>
            )}
            <UserMenu placement={menuPlacement(position)} />
          </>
        )}
      </nav>
      <div className={classes.content}>
        <Container size="lg">
          <Outlet />
        </Container>
      </div>
    </div>
  );
}
