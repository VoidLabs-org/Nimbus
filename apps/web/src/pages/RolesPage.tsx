import {
  Alert,
  Anchor,
  Badge,
  Center,
  Container,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, api, type Kind, type RoleSummary } from "../api/client";
import { UserMenu } from "../auth/UserMenu";

/**
 * Settings → Roles: every Role, platform roles and project roles in two sections. Read-only for now; editing
 * Roles comes next. Only Users with access:role:manage get the list; anyone else sees why not.
 */
export default function RolesPage() {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api
      .roles()
      .then((found) => {
        if (current) setRoles(found);
      })
      .catch((failure) => {
        if (!current) return;
        setError(
          failure instanceof ApiError && failure.status === 403
            ? "You don't have permission to manage Roles."
            : "Couldn't load the Roles. Please try again.",
        );
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md">
        <Anchor component={Link} to="/">
          Home
        </Anchor>
        <UserMenu />
      </Group>
      <Title order={2}>Roles & access</Title>
      <Text c="dimmed" mb="lg">
        A Role bundles Permissions. Platform roles apply across Nimbus; project roles apply to a
        Member in one project.
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      {!roles && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {roles && (
        <Stack gap="xl">
          <RoleSection title="Platform roles" kind="platform" roles={roles} />
          <RoleSection title="Project roles" kind="project" roles={roles} />
        </Stack>
      )}
    </Container>
  );
}

function RoleSection({ title, kind, roles }: { title: string; kind: Kind; roles: RoleSummary[] }) {
  const shown = roles.filter((role) => role.kind === kind);
  return (
    <Stack gap="xs">
      <Title order={4}>{title}</Title>
      {/* Fixed layout and the same widths in both sections, so their columns line up. */}
      <Table highlightOnHover layout="fixed">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th w={200}>Key</Table.Th>
            <Table.Th w={130}>{kind === "platform" ? "People" : "Assignments"}</Table.Th>
            <Table.Th w={120}>Permissions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((role) => (
            <Table.Tr key={role.key}>
              <Table.Td>
                <Group gap="xs">
                  <Anchor component={Link} to={`/settings/roles/${role.key}`}>
                    {role.name}
                  </Anchor>
                  {role.builtIn && (
                    <Badge size="xs" variant="light">
                      Built-in
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {role.description}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text ff="monospace" size="sm">
                  {role.key}
                </Text>
              </Table.Td>
              <Table.Td>{role.holders ?? "Everyone"}</Table.Td>
              <Table.Td>{role.permissions}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
