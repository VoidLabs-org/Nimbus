import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { ApiError, api, type CatalogPermission, type Role, type Scope } from "../api/client";
import { scopeLabels } from "./labels";

/** The Scopes a Permission may have in this Role: project roles use its own, platform roles hold project ones as All. */
function scopesIn(role: Role, permission: CatalogPermission): Scope[] {
  if (role.kind === "project") return permission.scopes;
  return permission.kind === "project" ? ["all"] : [];
}

/**
 * A Role's Permissions grouped by module heading, each with a checkbox and, where there is a choice, a Scope. Nothing
 * is saved until Save, which replaces all Grants at once and is refused if someone changed the Role meanwhile.
 * Locked Grants and Permissions only Platform admin may hold are shown but can't be changed.
 */
export function GrantsEditor({
  role,
  catalog,
  onSaved,
}: {
  role: Role;
  catalog: CatalogPermission[];
  onSaved: (role: Role) => void;
}) {
  const initial = new Map(role.grants.map((grant) => [grant.permission, grant.scope]));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locked = new Set(
    role.grants.filter((grant) => grant.locked).map((grant) => grant.permission),
  );
  const applicable = catalog.filter((permission) =>
    role.kind === "platform" ? true : permission.kind === "project" && permission.scopes.length > 0,
  );
  const headings = [...new Set(applicable.map((permission) => permission.heading))];
  const dirty =
    draft.size !== initial.size ||
    [...draft].some(
      ([permission, scope]) => !initial.has(permission) || initial.get(permission) !== scope,
    );

  function toggle(permission: CatalogPermission, checked: boolean) {
    const next = new Map(draft);
    if (checked) {
      const scopes = scopesIn(role, permission);
      next.set(permission.key, scopes.includes("project") ? "project" : (scopes[0] ?? null));
    } else {
      next.delete(permission.key);
    }
    setDraft(next);
  }

  function changeScope(permission: string, scope: Scope) {
    setDraft(new Map(draft).set(permission, scope));
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setFailure(null);
    try {
      const saved = await api.saveGrants(role.key, {
        grants: [...draft].map(([permission, scope]) => ({ permission, scope })),
        version: role.version,
      });
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setErrors(error.fieldErrors);
        setFailure("Some Permissions can't be held like this. See the messages below.");
      } else if (error instanceof ApiError && error.status === 409) {
        setFailure(error.message);
      } else {
        setFailure("Couldn't save the Permissions. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack>
      {failure && <Alert color="red">{failure}</Alert>}
      {headings.map((heading) => (
        <Paper key={heading} withBorder p="md" radius="md">
          <Title order={4} mb="sm">
            {heading}
          </Title>
          <Stack gap="sm">
            {applicable
              .filter((permission) => permission.heading === heading)
              .map((permission) => {
                const granted = draft.has(permission.key);
                const scope = draft.get(permission.key) ?? null;
                const scopes = scopesIn(role, permission);
                const reservedHere = permission.reserved && role.key !== "platform_admin";
                const fixed = role.locked || locked.has(permission.key) || reservedHere;
                return (
                  <Group
                    key={permission.key}
                    justify="space-between"
                    wrap="nowrap"
                    align="flex-start"
                  >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <Checkbox
                        checked={granted}
                        disabled={fixed}
                        onChange={(event) => toggle(permission, event.currentTarget.checked)}
                        aria-label={permission.key}
                      />
                      <div>
                        <Text ff="monospace" size="sm">
                          {permission.key}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {permission.description}
                        </Text>
                        {role.kind === "project" && permission.ownHint && (
                          <Text size="xs" c="dimmed">
                            Own: {permission.ownHint}
                          </Text>
                        )}
                        {role.kind === "platform" && permission.kind === "project" && (
                          <Text size="xs" c="dimmed">
                            A platform role holds this in every project (Scope All).
                          </Text>
                        )}
                        {locked.has(permission.key) && (
                          <Text size="xs" c="dimmed">
                            Always held by this Role.
                          </Text>
                        )}
                        {reservedHere && (
                          <Text size="xs" c="dimmed">
                            Only Platform admin may hold this.
                          </Text>
                        )}
                        {errors[permission.key] && (
                          <Text size="xs" c="red">
                            {errors[permission.key]}
                          </Text>
                        )}
                      </div>
                    </Group>
                    {granted && scopes.length > 1 && !fixed ? (
                      <Select
                        w={130}
                        size="xs"
                        allowDeselect={false}
                        aria-label={`Scope for ${permission.key}`}
                        data={scopes.map((value) => ({ value, label: scopeLabels[value] }))}
                        value={scope}
                        onChange={(value) => value && changeScope(permission.key, value as Scope)}
                      />
                    ) : (
                      granted && scope && <Badge variant="light">{scopeLabels[scope]}</Badge>
                    )}
                  </Group>
                );
              })}
          </Stack>
        </Paper>
      ))}
      {!role.locked && (
        <Group justify="flex-end">
          <Button variant="default" disabled={!dirty || saving} onClick={() => setDraft(initial)}>
            Discard changes
          </Button>
          <Button disabled={!dirty} loading={saving} onClick={save}>
            Save Permissions
          </Button>
        </Group>
      )}
    </Stack>
  );
}
