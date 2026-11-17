import { ApiError } from "@repo/api";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { useParams } from "react-router";
import { HoldersSkeleton } from "../access/HoldersSkeleton";
import { api, type MemberRole, type ProjectMember } from "../api/client";
import {
  loadFailure,
  refreshFailed,
  useMemberRoles,
  useMembersChanged,
  useProject,
  useProjectMembers,
} from "../api/queries";
import { useSession } from "../auth/useSession";
import { useMemberPermissions } from "../projects/useMemberPermissions";

/** "project_admin" as "Project admin", for a User who can't read the Roles' names. */
function plainName(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A project's Members tab: who is in the project with which project role. A User who may manage Members also adds a
 * User by email with a role, changes a role from a dropdown and removes Members; everyone else only reads. An
 * Archived project's Members are frozen. The signed-in User's own row has no controls: nobody changes their own
 * Role assignment, and the server refuses it anyway. Roles that give more than the User has are shown but can't be
 * chosen.
 */
export default function MembersPage() {
  const { key = "" } = useParams();
  const { user } = useSession();
  const project = useProject(key).data;
  const permissions = useMemberPermissions(project?.key);
  const editable = permissions.canManage && project !== undefined && !project.archived;
  const membersQuery = useProjectMembers(key);
  const members = membersQuery.data ?? null;
  const rolesQuery = useMemberRoles(key, editable);
  const roles: MemberRole[] = rolesQuery.data ?? [];
  const changed = useMembersChanged();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const loadError =
    loadFailure(membersQuery) || refreshFailed(membersQuery)
      ? membersQuery.error instanceof ApiError
        ? membersQuery.error.message
        : "Couldn't load the Members."
      : null;

  const nameOf = (roleKey: string | null) =>
    roleKey === null
      ? "No role"
      : (roles.find((role) => role.key === roleKey)?.name ?? plainName(roleKey));
  const options = roles.map((role) => ({
    value: role.key,
    label: role.name,
    disabled: !role.assignable,
  }));
  const form = useForm({
    initialValues: { email: "", role: "developer" },
    validate: {
      email: (value) => {
        if (!value.trim()) return "Enter an email";
        if (value.trim().toLowerCase() === user?.email.toLowerCase())
          return "You are already a Member";
        return null;
      },
      role: (value) => (value ? null : "Choose a project role"),
    },
  });

  // The role the form starts on: Developer when the User may give it, else the first role they may.
  const assignable = roles.filter((role) => role.assignable);
  const startRole = (assignable.find((role) => role.key === "developer") ?? assignable[0])?.key;
  const chosen = form.values.role;
  const roleToAdd = assignable.some((role) => role.key === chosen) ? chosen : (startRole ?? chosen);

  async function add(values: { email: string; role: string }) {
    setError(null);
    try {
      const added = await api.addMember(key, { email: values.email.trim(), role: roleToAdd });
      form.setFieldValue("email", "");
      toast.success(`Added ${added.displayName} as ${nameOf(added.role)}.`);
      changed(key);
    } catch (failure) {
      if (failure instanceof ApiError && failure.fieldErrors.email)
        form.setFieldError("email", failure.fieldErrors.email);
      else if (failure instanceof ApiError && failure.fieldErrors.role)
        form.setFieldError("role", failure.fieldErrors.role);
      else if (failure instanceof ApiError && failure.status === 404)
        form.setFieldError("email", failure.message);
      else if (failure instanceof ApiError && failure.status === 409) {
        // Already a Member, or the project was Archived meanwhile: say it, and show the Members as they are now.
        setError(failure.message);
        changed(key);
      } else if (failure instanceof ApiError && failure.status === 403) setError(failure.message);
      else setError("Couldn't add the Member. Please try again.");
    }
  }

  async function changeRole(member: ProjectMember, role: string | null) {
    if (!role || role === member.role) return;
    setError(null);
    try {
      await api.changeMemberRole(key, member.id, role);
      toast.success(`${member.displayName} is now ${nameOf(role)}.`);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Couldn't change the role. Please try again.",
      );
    } finally {
      // Whatever happened, show the Members as they are now.
      changed(key);
    }
  }

  async function remove() {
    if (!removing) return;
    setError(null);
    setRemoveBusy(true);
    try {
      await api.removeMember(key, removing.id);
      toast.success(`Removed ${removing.displayName}.`);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Couldn't remove the Member. Please try again.",
      );
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
      changed(key);
    }
  }

  return (
    <Stack>
      {project?.archived && (
        <Text c="dimmed" size="sm">
          This project is Archived, so its Members can't be changed.
        </Text>
      )}
      {error && <Alert color="red">{error}</Alert>}
      {loadError && (
        <Alert color="red">
          {loadError}{" "}
          <Button size="compact-xs" variant="subtle" onClick={() => void membersQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      )}
      {editable && (
        <form onSubmit={form.onSubmit(add)}>
          <Group align="flex-start" gap="xs">
            <TextInput
              placeholder="Email of an existing User"
              aria-label="Email"
              w={320}
              disabled={!members}
              {...form.getInputProps("email")}
            />
            <Select
              aria-label="Project role"
              w={200}
              allowDeselect={false}
              data={options}
              disabled={!members || options.length === 0}
              {...form.getInputProps("role")}
              value={roleToAdd}
            />
            <Button type="submit" loading={form.submitting} disabled={!members}>
              Add Member
            </Button>
          </Group>
        </form>
      )}
      {!members && !loadError && (
        <Loading>
          <HoldersSkeleton />
        </Loading>
      )}
      {members && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Member</Table.Th>
              <Table.Th>Project role</Table.Th>
              <Table.Th>Added</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.map((member) => {
              const self = member.id === user?.id;
              return (
                <Table.Tr key={member.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <ProfilePicture name={member.displayName} src={member.avatarUrl} size={26} />
                      <div>
                        <Group gap={6}>
                          <Text size="sm">{member.displayName}</Text>
                          {self && (
                            <Badge size="xs" variant="light">
                              You
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {member.email}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {editable && !self ? (
                      <Select
                        aria-label={`Project role of ${member.displayName}`}
                        size="xs"
                        w={180}
                        allowDeselect={false}
                        data={options}
                        value={member.role}
                        onChange={(role) => void changeRole(member, role)}
                      />
                    ) : (
                      <Text size="sm">{nameOf(member.role)}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {new Date(member.addedAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                  <Table.Td align="right">
                    {editable && !self && (
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => setRemoving(member)}
                      >
                        Remove
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.displayName ?? "this Member"}?`}
      >
        <Text size="sm" mb="md">
          They lose access to the project, and their Issues in it become unassigned.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button color="red" loading={removeBusy} onClick={remove}>
            Remove
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
