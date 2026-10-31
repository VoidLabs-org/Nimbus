import { ApiError } from "@repo/api";
import { Alert, Badge, Button, Group, Modal, Stack, Table, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Role, type RoleHolder } from "../api/client";
import { loadFailure, refreshFailed, useRoleHolders, useRolesChanged } from "../api/queries";
import { useSession } from "../auth/useSession";
import { HoldersSkeleton } from "./HoldersSkeleton";

/**
 * A platform role's People tab: who holds it, giving it to a User by email, and taking it away. The signed-in User's
 * own row has no Remove: nobody changes their own Role assignments, and the server refuses it anyway.
 */
export function RoleHolders({ role }: { role: Role }) {
  const { user } = useSession();
  const holdersQuery = useRoleHolders(role.key);
  const holders = holdersQuery.data ?? null;
  // A first load that failed, or a refresh that did (after giving or taking the Role) and left the list out of date.
  const loadError =
    loadFailure(holdersQuery) || refreshFailed(holdersQuery)
      ? holdersQuery.error instanceof ApiError
        ? holdersQuery.error.message
        : "Couldn't load who holds this Role."
      : null;
  // Every change refreshes the holders, the Role's holder count and whatever else shows them, so the list stays
  // complete and sorted and shows what other admins changed meanwhile.
  const rolesChanged = useRolesChanged();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RoleHolder | null>(null);
  const takeRole = useMutation({
    mutationFn: (holder: RoleHolder) => api.takeRole(role.key, holder.id),
  });
  const form = useForm({
    initialValues: { email: "" },
    validate: {
      email: (value) => {
        if (!value.trim()) return "Enter an email";
        // The server refuses it too; caught here so a 403 from the server can only mean a missing Permission.
        if (value.trim().toLowerCase() === user?.email.toLowerCase())
          return "You can't give yourself a Role";
        return null;
      },
    },
  });

  function changed() {
    void rolesChanged();
  }

  async function give(values: { email: string }) {
    setError(null);
    try {
      const added = await api.giveRole(role.key, values.email.trim());
      form.reset();
      toast.success(`Gave ${role.name} to ${added.email ?? "them"}.`);
      changed();
    } catch (failure) {
      if (failure instanceof ApiError && failure.fieldErrors.email)
        form.setFieldError("email", failure.fieldErrors.email);
      else if (failure instanceof ApiError && [404, 409].includes(failure.status))
        form.setFieldError("email", failure.message);
      else if (failure instanceof ApiError && failure.status === 403)
        setError("You no longer have permission to give Roles. Reload the page.");
      else setError("Couldn't give the Role. Please try again.");
    }
  }

  async function take() {
    if (!removing) return;
    setError(null);
    try {
      await takeRole.mutateAsync(removing);
      toast.success(`Took ${role.name} from ${removing.email ?? "them"}.`);
      changed();
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : "Couldn't take the Role. Please try again.",
      );
      // Someone else already took it away: show the list as it is now.
      if (failure instanceof ApiError && failure.status === 404) changed();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      {loadError && (
        <Alert color="red">
          {loadError}{" "}
          <Button size="compact-xs" variant="subtle" onClick={() => void holdersQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      )}
      {/* Disabled until the list is there, so a change never shows a partial list as if it were complete. */}
      <form onSubmit={form.onSubmit(give)}>
        <Group align="flex-start" gap="xs">
          <TextInput
            placeholder="Email of a User who signed in with Google or GitHub"
            aria-label="Email"
            w={360}
            disabled={!holders}
            {...form.getInputProps("email")}
          />
          <Button type="submit" loading={form.submitting} disabled={!holders}>
            Add
          </Button>
        </Group>
      </form>
      {!holders && !loadError && (
        <Loading>
          <HoldersSkeleton />
        </Loading>
      )}
      {holders && holders.length === 0 && <Text c="dimmed">Nobody holds this Role yet.</Text>}
      {holders && holders.length > 0 && (
        <Table>
          <Table.Tbody>
            {holders.map((holder) => (
              <Table.Tr key={holder.id}>
                <Table.Td>
                  <Group gap="sm">
                    <ProfilePicture
                      name={holder.displayName ?? "Unknown User"}
                      src={holder.avatarUrl}
                      size={26}
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
          <Button color="red" loading={takeRole.isPending} onClick={take}>
            Remove
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
