import { Burger, Container, Group, Popover, Stack, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { ThemeToggles } from "@repo/ui/theme-toggles";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { UserMenu } from "../auth/UserMenu";
import classes from "./AppShell.module.css";
import { NimbusLogo } from "./NimbusLogo";
import { DESTINATIONS, type Destination } from "./navigation";

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
 * Every signed-in page: the pill navbar on top, the page below. Wide screens show the links and the theme capsule
 * (light/dark and glass) in the bar; narrow ones fold them into a menu next to the avatar.
 */
export function AppShell() {
  // Starts the request (and caches it) on every signed-in page, so Settings lists its groups at once.
  usePlatformPermissions();
  const narrow = useMediaQuery(NARROW, false, { getInitialValueInEffect: false });
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Container size="lg" pt="md">
      <nav className={classes.bar} aria-label="Main">
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
        <UserMenu />
      </nav>
      <Outlet />
    </Container>
  );
}
