import {
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { ApiError, api, type Role, type RoleHolder } from "../api/client";
import { useSession } from "../auth/useSession";

/**
 * A platform role's People tab: who holds it, giving it to a User by email, and taking it away. The signed-in User's
 * own row has no Remove: nobody changes their own Role assignments, and the server refuses it anyway.
 */
export function RoleHolders({ role, onChanged }: { role: Role; onChanged: () => void }) {
  const { user } = useSession();
  const [holders, setHolders] = useState<RoleHolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RoleHolder | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { email: "" },
    validate: { email: (value) => (value.trim() ? null : "Enter an email") },
  });

  useEffect(() => {
    let current = true;
    api
      .roleHolders(role.key)
      .then((found) => {
        if (current) setHolders(found);
      })
      .catch((failure) => {
        if (current)
          setError(
            failure instanceof ApiError ? failure.message : "Couldn't load who holds this Role.",
          );
      });
    return () => {
      current = false;
    };
  }, [role.key]);

  async function give(values: { email: string }) {
    setError(null);
    try {
      const added = await api.giveRole(role.key, values.email.trim());
      setHolders((current) => [...(current ?? []), added]);
      form.reset();
      notifications.show({ message: `Gave ${role.name} to ${added.email ?? "them"}.` });
      onChanged();
    } catch (failure) {
      if (failure instanceof ApiError && failure.fieldErrors.email)
        form.setFieldError("email", failure.fieldErrors.email);
      else if (failure instanceof ApiError && [403, 404, 409].includes(failure.status))
        form.setFieldError("email", failure.message);
      else setError("Couldn't give the Role. Please try again.");
    }
  }

  async function take() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await api.takeRole(role.key, removing.id);
      setHolders((current) => (current ?? []).filter((holder) => holder.id !== removing.id));
      notifications.show({ message: `Took ${role.name} from ${removing.email ?? "them"}.` });
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : "Couldn't take the Role. Please try again.",
      );
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  }

  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      <form onSubmit={form.onSubmit(give)}>
        <Group align="flex-start" gap="xs">
          <TextInput
            placeholder="Email of an existing User"
            aria-label="Email"
            w={320}
            {...form.getInputProps("email")}
          />
          <Button type="submit" loading={form.submitting}>
            Add
          </Button>
        </Group>
      </form>
      {!holders && !error && (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      )}
      {holders && holders.length === 0 && <Text c="dimmed">Nobody holds this Role yet.</Text>}
      {holders && holders.length > 0 && (
        <Table>
          <Table.Tbody>
            {holders.map((holder) => (
              <Table.Tr key={holder.id}>
                <Table.Td>
                  <Group gap="sm">
                    <Avatar
                      src={holder.avatarUrl}
                      name={holder.displayName ?? undefined}
                      size="sm"
                    />
                    <div>
                      <Group gap={6}>
                        <Text size="sm">{holder.displayName ?? "Unknown User"}</Text>
                        {holder.id === user?.id && (
                          <Badge size="xs" variant="light">
                            You
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {holder.email ?? holder.id}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    Since {new Date(holder.since).toLocaleDateString()}
                  </Text>
                </Table.Td>
                <Table.Td align="right">
                  {holder.id !== user?.id && (
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      onClick={() => setRemoving(holder)}
                    >
                      Remove
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Take ${role.name} from ${removing?.displayName ?? "this User"}?`}
      >
        <Text size="sm" mb="md">
          They lose every Permission this Role gives them straight away.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={take}>
            Remove
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
