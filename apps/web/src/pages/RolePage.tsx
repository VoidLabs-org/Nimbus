import {
  Alert,
  Anchor,
  Badge,
  Center,
  Checkbox,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { kindLabels, scopeLabels } from "../access/labels";
import { ApiError, api, type CatalogPermission, type Role } from "../api/client";
import { UserMenu } from "../auth/UserMenu";

/**
 * One Role's Permissions, grouped by module heading, each with whether the Role grants it and with which Scope.
 * Read-only for now. A project role lists only Permissions that project roles can hold; a platform role lists
 * every Permission, project ones always with Scope All.
 */
export default function RolePage() {
  const { key = "" } = useParams();
  const [loaded, setLoaded] = useState<{ role: Role; catalog: CatalogPermission[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([api.role(key), api.permissionCatalog()])
      .then(([role, catalog]) => {
        if (current) setLoaded({ role, catalog });
      })
      .catch((failure) => {
        if (!current) return;
        if (failure instanceof ApiError && failure.status === 404)
          setError("No Role has this key.");
        else if (failure instanceof ApiError && failure.status === 403)
          setError("You don't have permission to manage Roles.");
        else setError("Couldn't load this Role. Please try again.");
      });
    return () => {
      current = false;
    };
  }, [key]);

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md">
        <Anchor component={Link} to="/settings/roles">
          ← Roles & access
        </Anchor>
        <UserMenu />
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      {!loaded && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {loaded && <RoleDetails role={loaded.role} catalog={loaded.catalog} />}
    </Container>
  );
}

function RoleDetails({ role, catalog }: { role: Role; catalog: CatalogPermission[] }) {
  const granted = new Map(role.grants.map((grant) => [grant.permission, grant.scope]));
  const applicable = catalog.filter((permission) =>
    role.kind === "platform" ? true : permission.kind === "project" && permission.scopes.length > 0,
  );
  const headings = [...new Set(applicable.map((permission) => permission.heading))];

  return (
    <Stack>
      <div>
        <Group gap="xs">
          <Title order={2}>{role.name}</Title>
          {role.builtIn && <Badge variant="light">Built-in</Badge>}
          <Badge variant="outline">{kindLabels[role.kind]}</Badge>
        </Group>
        <Text c="dimmed">{role.description}</Text>
        <Text size="sm" c="dimmed" mt={4}>
          {role.holders === null
            ? "Every signed-in User holds this Role."
            : `Held by ${role.holders} ${role.holders === 1 ? "User" : "Users"}.`}
        </Text>
      </div>
      {headings.map((heading) => (
        <Paper key={heading} withBorder p="md" radius="md">
          <Title order={4} mb="sm">
            {heading}
          </Title>
          <Stack gap="sm">
            {applicable
              .filter((permission) => permission.heading === heading)
              .map((permission) => {
                const scope = granted.get(permission.key);
                return (
                  <Group
                    key={permission.key}
                    justify="space-between"
                    wrap="nowrap"
                    align="flex-start"
                  >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <Checkbox
                        checked={granted.has(permission.key)}
                        readOnly
                        aria-label={permission.key}
                      />
                      <div>
                        <Text ff="monospace" size="sm">
                          {permission.key}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {permission.description}
                        </Text>
                        {permission.ownHint && (
                          <Text size="xs" c="dimmed">
                            Own: {permission.ownHint}
                          </Text>
                        )}
                      </div>
                    </Group>
                    {granted.has(permission.key) && scope && (
                      <Badge variant="light">{scopeLabels[scope]}</Badge>
                    )}
                  </Group>
                );
              })}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
