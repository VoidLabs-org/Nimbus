import { Button, Stack } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Tag } from "@repo/ui/tag";
import type { Role } from "../api/client";
import { kindLabels } from "./labels";
import { heldBy } from "./roleRow";
import classes from "./RoleSummary.module.css";

/**
 * The panel beside a Role's Permissions: its tags, how many of the Permissions it can hold it grants, its key, who
 * holds it, Save and Discard (Permissions tab only) and the Role's other actions.
 */
export function RoleSummary({
  role,
  granted,
  grantable,
  showSave,
  changes,
  saving,
  onSave,
  onDiscard,
  onRename,
  onReset,
  onDelete,
}: {
  role: Role;
  /** How many Permissions are ticked, unsaved ones included. */
  granted: number;
  /** How many Permissions this kind of Role can hold. */
  grantable: number;
  /** Save and Discard show only while the Permissions tab is open. */
  showSave: boolean;
  changes: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRename: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <Panel p="lg" className={classes.summary}>
      <div className={classes.tags}>
        <Tag>{kindLabels[role.kind]}</Tag>
        {role.builtIn && <Tag>Built-in</Tag>}
        {role.customised && <Tag>Customised</Tag>}
      </div>
      <dl className={classes.facts}>
        <div>
          <dt>Permissions</dt>
          <dd className={classes.count}>
            {granted} of {grantable} granted
          </dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd className={classes.key}>{role.key}</dd>
        </div>
        <div>
          <dt>Held by</dt>
          <dd>{heldBy(role)}</dd>
        </div>
      </dl>
      {!role.locked && (
        <Stack gap="xs">
          {showSave && (
            <>
              <Button
                disabled={changes === 0}
                loading={saving}
                onClick={onSave}
                fullWidth
                aria-label={
                  changes === 0
                    ? "Save Permissions"
                    : `Save Permissions (${changes} unsaved ${changes === 1 ? "change" : "changes"})`
                }
                rightSection={
                  changes > 0 && (
                    <span className={classes.badge} aria-hidden>
                      {changes}
                    </span>
                  )
                }
              >
                Save Permissions
              </Button>
              <Button
                variant="default"
                disabled={changes === 0 || saving}
                onClick={onDiscard}
                fullWidth
              >
                Discard changes
              </Button>
            </>
          )}
          <Button variant="default" onClick={onRename} fullWidth>
            Rename
          </Button>
          {role.builtIn && role.customised && (
            <Button variant="default" onClick={onReset} fullWidth>
              Reset to defaults
            </Button>
          )}
          {!role.builtIn && (
            <Button color="red" variant="light" onClick={onDelete} fullWidth>
              Delete
            </Button>
          )}
        </Stack>
      )}
    </Panel>
  );
}
