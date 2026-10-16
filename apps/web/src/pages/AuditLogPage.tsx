import {
  Alert,
  Anchor,
  Button,
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
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { ApiError, api, type AuditPage } from "../api/client";
import { UserMenu } from "../auth/UserMenu";

const PAGE_SIZE = 50;

/**
 * Settings → Audit log: every change to Roles and their Permissions, newest first, with who made it. Entries are
 * kept for good and never edited. Only Users with access:audit:view get the list.
 */
export default function AuditLogPage() {
  const canOpenRoles = usePlatformPermissions().includes("access:role:manage");
  // `asOf` pins the set of entries the pages are cut from, so entries written meanwhile don't shift them; "Show newest"
  // starts a fresh set. A result or an error belongs to the page it was asked for, so switching pages never shows
  // the previous page's rows or an old error as if they were current.
  const [view, setView] = useState<{ page: number; asOf?: number }>({ page: 0 });
  const [result, setResult] = useState<{
    page: number;
    asOf?: number;
    loaded?: AuditPage;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let current = true;
    api
      .auditLog(view.page, PAGE_SIZE, view.asOf)
      .then((loaded) => {
        if (current) setResult({ page: view.page, asOf: view.asOf, loaded });
      })
      .catch((failure) => {
        if (!current) return;
        setResult({
          page: view.page,
          asOf: view.asOf,
          error:
            failure instanceof ApiError && failure.status === 403
              ? "You don't have permission to read the audit log."
              : "Couldn't load the audit log. Please try again.",
        });
      });
    return () => {
      current = false;
    };
  }, [view]);

  const current = result && result.page === view.page && result.asOf === view.asOf ? result : null;
  const loaded = current?.loaded ?? null;
  const error = current?.error ?? null;
  const pages = loaded ? Math.max(1, Math.ceil(loaded.total / PAGE_SIZE)) : 1;

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md">
        <Anchor component={Link} to="/">
          Home
        </Anchor>
        <UserMenu />
      </Group>
      <Group justify="space-between" align="flex-start">
        <Title order={2}>Audit log</Title>
        <Button variant="default" onClick={() => setView({ page: 0 })}>
          Show newest
        </Button>
      </Group>
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
                    {!entry.target.exists || !canOpenRoles ? (
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
              <Pagination
                total={pages}
                value={view.page + 1}
                onChange={(value) => setView({ page: value - 1, asOf: loaded?.asOf ?? view.asOf })}
              />
            </Group>
          )}
        </>
      )}
    </Container>
  );
}
