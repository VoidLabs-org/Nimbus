import { Alert, Stack, Text, Tooltip, VisuallyHidden } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { RoundCheck } from "@repo/ui/round-check";
import { ScopePill } from "@repo/ui/scope-pill";
import type { CatalogPermission, Role, Scope } from "../api/client";
import { grantable, scopesIn } from "./grants";
import { scopeLabels } from "./labels";
import type { GrantsDraft } from "./useGrantsDraft";
import classes from "./GrantsEditor.module.css";

/**
 * A Role's Permissions grouped by module heading in Panels, each with a round check and, once granted, its Scope.
 * Locked Grants and Permissions only Platform admin may hold are greyed out, with the reason on hover. Saving is in
 * the summary panel; this only shows and edits the draft.
 */
export function GrantsEditor({
  role,
  catalog,
  grants,
}: {
  role: Role;
  catalog: CatalogPermission[];
  grants: GrantsDraft;
}) {
  const { draft, errors, failure } = grants;
  const locked = new Set(
    role.grants.filter((grant) => grant.locked).map((grant) => grant.permission),
  );
  const applicable = grantable(role.kind, catalog);
  const headings = [...new Set(applicable.map((permission) => permission.heading))];

  return (
    <Stack>
      {failure && <Alert color="red">{failure}</Alert>}
      {headings.map((heading) => (
        <Panel key={heading} p={8}>
          <h3 className={classes.heading}>{heading}</h3>
          <ul className={classes.list} aria-label={heading}>
            {applicable
              .filter((permission) => permission.heading === heading)
              .map((permission) => (
                <PermissionRow
                  key={permission.key}
                  role={role}
                  permission={permission}
                  granted={draft.has(permission.key)}
                  scope={draft.get(permission.key) ?? null}
                  reason={reasonFixed(role, permission, locked)}
                  error={errors[permission.key]}
                  grants={grants}
                />
              ))}
          </ul>
        </Panel>
      ))}
    </Stack>
  );
}

/** Why a Permission can't be changed in this Role, if it can't. */
function reasonFixed(
  role: Role,
  permission: CatalogPermission,
  locked: Set<string>,
): string | null {
  if (permission.reserved && role.key !== "platform_admin")
    return "Only Platform admin may hold this";
  if (locked.has(permission.key)) return "Always held by this Role";
  return null;
}

function PermissionRow({
  role,
  permission,
  granted,
  scope,
  reason,
  error,
  grants,
}: {
  role: Role;
  permission: CatalogPermission;
  granted: boolean;
  scope: Scope | null;
  reason: string | null;
  error: string | undefined;
  grants: GrantsDraft;
}) {
  const scopes = scopesIn(role, permission);
  const fixed = role.locked || reason !== null || grants.saving;
  return (
    <li>
      <Tooltip label={reason} disabled={reason === null} position="top-start">
        <div className={classes.row} data-fixed={fixed || undefined}>
          <RoundCheck
            checked={granted}
            disabled={fixed}
            onChange={(event) => grants.toggle(permission, event.currentTarget.checked)}
            aria-label={permission.key}
          />
          <div className={classes.text}>
            <div className={classes.description}>{permission.description}</div>
            <div className={classes.key}>{permission.key}</div>
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
            {reason && <VisuallyHidden>{reason}.</VisuallyHidden>}
            {error && (
              <Text size="xs" c="red">
                {error}
              </Text>
            )}
          </div>
          {granted && scope && scopes.length > 0 && (
            <div className={classes.scope}>
              <ScopePill
                aria-label={`Scope for ${permission.key}`}
                data={scopes.map((value) => ({ value, label: scopeLabels[value] }))}
                value={scope}
                disabled={fixed || scopes.length < 2}
                onChange={(value) => grants.changeScope(permission.key, value as Scope)}
              />
            </div>
          )}
        </div>
      </Tooltip>
    </li>
  );
}
