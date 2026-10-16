import {
  Alert,
  Anchor,
  Center,
  Container,
  Group,
  Loader,
  Pagination,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { describeAuditEntry } from "../access/auditText";
import { ApiError, api, type AuditPage } from "../api/client";
import { UserMenu } from "../auth/UserMenu";

const PAGE_SIZE = 50;

/**
 * Settings → Audit log: every change to Roles and their Permissions, newest first, with who made it. Entries are
 * kept for good and never edited. Only Users with access:audit:view get the list.
 */
export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    api
      .auditLog(page, PAGE_SIZE)
      .then((found) => {
        if (current) setLoaded(found);
      })
      .catch((failure) => {
        if (!current) return;
        setError(
          failure instanceof ApiError && failure.status === 403
            ? "You don't have permission to read the audit log."
            : "Couldn't load the audit log. Please try again.",
        );
      });
    return () => {
      current = false;
    };
  }, [page]);

  const pages = loaded ? Math.max(1, Math.ceil(loaded.total / PAGE_SIZE)) : 1;

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md">
        <Anchor component={Link} to="/">
          Home
        </Anchor>
        <UserMenu />
      </Group>
      <Title order={2}>Audit log</Title>
      <Text c="dimmed" mb="lg">
        Every change to Roles and their Permissions, newest first. Entries are never edited or
        deleted.
      </Text>
      {error && <Alert color="red">{error}</Alert>}
      {!loaded && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {loaded && loaded.entries.length === 0 && <Text c="dimmed">Nothing has changed yet.</Text>}
      {loaded && loaded.entries.length > 0 && (
        <>
          <Table layout="fixed" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={190}>When</Table.Th>
                <Table.Th w={200}>Who</Table.Th>
                <Table.Th w={180}>Role</Table.Th>
                <Table.Th>What</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loaded.entries.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>
                    <Text size="sm">{new Date(entry.at).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    {entry.actor ? (
                      <>
                        <Text size="sm">{entry.actor.displayName ?? "A deleted User"}</Text>
                        {entry.actor.email && (
                          <Text size="xs" c="dimmed">
                            {entry.actor.email}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text size="sm" c="dimmed">
                        System
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {entry.action === "role.deleted" ? (
                      <Text ff="monospace" size="sm">
                        {entry.target.key}
                      </Text>
                    ) : (
                      <Anchor
                        component={Link}
                        to={`/settings/roles/${entry.target.key}`}
                        ff="monospace"
                        size="sm"
                      >
                        {entry.target.key}
                      </Anchor>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{describeAuditEntry(entry)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {pages > 1 && (
            <Group justify="center" mt="md">
              <Pagination total={pages} value={page + 1} onChange={(value) => setPage(value - 1)} />
            </Group>
          )}
        </>
      )}
    </Container>
  );
}
