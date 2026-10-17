import {
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { GrantsEditor } from "../access/GrantsEditor";
import { kindLabels } from "../access/labels";
import { RoleHolders } from "../access/RoleHolders";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { ApiError, api, type CatalogPermission, type Role } from "../api/client";

/**
 * One Role: its name and description, and its Permissions with their Scopes, all editable except for Platform admin.
 * Built-in Roles can be reset to their defaults; custom Roles nobody holds can be deleted.
 */
export default function RolePage() {
  const { key = "" } = useParams();
  // A fresh page per Role, so nothing (a loaded Role, a draft) carries over when the address changes.
  return <RoleDetails key={key} roleKey={key} />;
}

function RoleDetails({ roleKey: key }: { roleKey: string }) {
  const [role, setRole] = useState<Role | null>(null);
  const [catalog, setCatalog] = useState<CatalogPermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const platformPermissions = usePlatformPermissions();

  useEffect(() => {
    let current = true;
    Promise.all([api.role(key), api.permissionCatalog()])
      .then(([found, permissions]) => {
        if (!current) return;
        setRole(found);
        setCatalog(permissions);
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

  // Everyone is held by every signed-in User, and project roles are given on a project's Members page.
  const hasPeople =
    role !== null &&
    role.kind === "platform" &&
    role.key !== "everyone" &&
    platformPermissions.includes("access:role:assign");

  // The holder count in the header changes when someone is given or loses the Role.
  function refresh() {
    api
      .role(key)
      .then(setRole)
      .catch(() =>
        notifications.show({
          color: "yellow",
          message: "Couldn't refresh this Role's holder count; reload the page to see it.",
        }),
      );
  }

  // Restarts only when the stored Grants change (saved or reset): renaming keeps unsaved ticks.
  const grants = role && (
    <GrantsEditor key={grantsSignature(role)} role={role} catalog={catalog} onSaved={setRole} />
  );

  return (
    <Container size="lg" px={0} py="xl">
      <Anchor component={Link} to="/settings/roles" display="inline-block" mb="md">
        ← Roles & access
      </Anchor>
      {error && <Alert color="red">{error}</Alert>}
      {!role && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {role && (
        <Stack>
          <RoleHeader role={role} onChanged={setRole} />
          {role.locked && (
            <Alert color="gray">
              Platform admin is locked: it always holds every Permission, including new ones.
            </Alert>
          )}
          {role.newPermissions.length > 0 && (
            <Alert color="blue" title="New Permissions">
              Added to Nimbus since this Role was customised, and part of its defaults:{" "}
              {role.newPermissions.join(", ")}. Tick them below to add them, or reset the Role to
              its defaults.
            </Alert>
          )}
          {/* Always inside Tabs, so the Grants editor keeps its place (and unsaved ticks) when the People tab
              appears once the signed-in User's Permissions arrive. */}
          <Tabs defaultValue="permissions" keepMounted>
            {hasPeople && (
              <Tabs.List mb="md">
                <Tabs.Tab value="permissions">Permissions</Tabs.Tab>
                <Tabs.Tab value="people">People</Tabs.Tab>
              </Tabs.List>
            )}
            <Tabs.Panel value="permissions">{grants}</Tabs.Panel>
            {hasPeople && (
              <Tabs.Panel value="people">
                <RoleHolders role={role} onChanged={refresh} />
              </Tabs.Panel>
            )}
          </Tabs>
        </Stack>
      )}
    </Container>
  );
}

function grantsSignature(role: Role): string {
  return role.grants
    .map((grant) => `${grant.permission}=${grant.scope ?? ""}`)
    .sort()
    .join(",");
}

function RoleHeader({ role, onChanged }: { role: Role; onChanged: (role: Role) => void }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { name: role.name, description: role.description },
    validate: { name: (value) => (value.trim() ? null : "Enter a name") },
  });

  async function rename(values: { name: string; description: string }) {
    setFailure(null);
    try {
      onChanged(
        await api.describeRole(role.key, {
          name: values.name.trim(),
          description: values.description.trim(),
          version: role.version,
        }),
      );
      setEditing(false);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
        form.setErrors(error.fieldErrors);
      else
        setFailure(error instanceof ApiError ? error.message : "Couldn't save. Please try again.");
    }
  }

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      if (confirming === "reset") {
        onChanged(await api.resetRole(role.key, role.version));
        notifications.show({ message: `${role.name} is back to its defaults.` });
      } else {
        await api.deleteRole(role.key);
        notifications.show({ message: `Deleted ${role.name}.` });
        navigate("/settings/roles", { replace: true });
      }
      setConfirming(null);
    } catch (error) {
      setConfirming(null);
      setFailure(
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {failure && (
        <Alert color="red" mb="sm">
          {failure}
        </Alert>
      )}
      {editing ? (
        <form onSubmit={form.onSubmit(rename)}>
          <Stack gap="xs" maw={560}>
            <TextInput label="Name" {...form.getInputProps("name")} />
            <Textarea
              label="Description"
              autosize
              minRows={2}
              {...form.getInputProps("description")}
            />
            <Group>
              <Button type="submit" loading={form.submitting}>
                Save
              </Button>
              <Button variant="default" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <>
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              <Title order={2}>{role.name}</Title>
              {role.builtIn && <Badge variant="light">Built-in</Badge>}
              {role.customised && (
                <Badge variant="light" color="yellow">
                  Customised
                </Badge>
              )}
              <Badge variant="outline">{kindLabels[role.kind]}</Badge>
            </Group>
            {!role.locked && (
              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => {
                    form.setValues({ name: role.name, description: role.description });
                    setEditing(true);
                  }}
                >
                  Rename
                </Button>
                {role.builtIn && role.customised && (
                  <Button variant="default" size="xs" onClick={() => setConfirming("reset")}>
                    Reset to defaults
                  </Button>
                )}
                {!role.builtIn && (
                  <Button
                    color="red"
                    variant="light"
                    size="xs"
                    onClick={() => setConfirming("delete")}
                  >
                    Delete
                  </Button>
                )}
              </Group>
            )}
          </Group>
          <Text c="dimmed">{role.description}</Text>
          <Text size="sm" c="dimmed" mt={4}>
            <Text span ff="monospace" size="sm">
              {role.key}
            </Text>
            {" · "}
            {role.holders === null
              ? "Every signed-in User holds this Role."
              : `Held by ${role.holders} ${role.holders === 1 ? "assignment" : "assignments"}.`}
          </Text>
        </>
      )}
      <Modal
        opened={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === "reset" ? "Reset to defaults?" : `Delete ${role.name}?`}
      >
        <Text size="sm" mb="md">
          {confirming === "reset"
            ? "Its name, description and Permissions go back to what Nimbus ships with. Your changes are lost."
            : "This can't be undone. A Role someone still holds can't be deleted."}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            color={confirming === "delete" ? "red" : undefined}
            loading={busy}
            onClick={confirm}
          >
            {confirming === "reset" ? "Reset" : "Delete"}
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
