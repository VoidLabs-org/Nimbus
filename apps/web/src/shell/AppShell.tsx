import { Burger, Container, Group, Menu, UnstyledButton } from "@mantine/core";
import { useNimbusTheme } from "@repo/ui/nimbus-theme";
import { ThemeToggles } from "@repo/ui/theme-toggles";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { UserMenu } from "../auth/UserMenu";
import classes from "./AppShell.module.css";

type Destination = { to: string; label: string; end?: boolean };

/** The pages a signed-in User may open from the navbar: Roles & access and the Audit log only with their Permission. */
function useDestinations(): Destination[] {
  const platformPermissions = usePlatformPermissions();
  const destinations: Destination[] = [{ to: "/", label: "Home", end: true }];
  if (platformPermissions.includes("access:role:manage"))
    destinations.push({ to: "/settings/roles", label: "Roles & access" });
  if (platformPermissions.includes("access:audit:view"))
    destinations.push({ to: "/settings/audit", label: "Audit log" });
  return destinations;
}

/**
 * Every signed-in page: the pill navbar on top, the page below. Wide screens show the links and the theme capsule
 * (light/dark and glass) in the bar; narrow ones fold them into a menu next to the avatar.
 */
export function AppShell() {
  const { mode } = useNimbusTheme();
  const destinations = useDestinations();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Container size="lg" pt="md">
      <nav className={classes.bar} aria-label="Main">
        <UnstyledButton component={Link} to="/" className={classes.brand}>
          {/* The light logo has dark bars for light themes; the dark one cream bars for dark themes. */}
          <img
            src={mode === "dark" ? "/nimbus-icon-dark.png" : "/nimbus-icon-light.png"}
            alt=""
            width={24}
            height={24}
          />
          nimbus
        </UnstyledButton>
        <Group gap={4} visibleFrom="md" wrap="nowrap">
          {destinations.map((destination) => (
            <NavLink
              key={destination.to}
              to={destination.to}
              end={destination.end}
              className={({ isActive }) =>
                isActive ? `${classes.link} ${classes.active}` : classes.link
              }
            >
              {destination.label}
            </NavLink>
          ))}
        </Group>
        <Group visibleFrom="md" ml={8}>
          <ThemeToggles />
        </Group>
        <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-end" width={240}>
          <Menu.Target>
            <Burger
              hiddenFrom="md"
              size="sm"
              opened={menuOpen}
              aria-label={menuOpen ? "Close the menu" : "Open the menu"}
            />
          </Menu.Target>
          <Menu.Dropdown>
            {destinations.map((destination) => (
              <Menu.Item key={destination.to} component={Link} to={destination.to}>
                {destination.label}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Group p="xs">
              <ThemeToggles />
            </Group>
          </Menu.Dropdown>
        </Menu>
        <UserMenu />
      </nav>
      <Outlet />
    </Container>
  );
}
