import { Alert, Button, Center, Container, Loader, Stack, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { PillTabs } from "@repo/ui/pill-tabs";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { NewRoleModal } from "../access/NewRoleModal";
import { heldBy, permissionCount, roleTag } from "../access/roleRow";
import { ApiError, api, type Kind, type RoleSummary } from "../api/client";
import classes from "./RolesPage.module.css";

const TABS: { value: Kind; label: string }[] = [
  { value: "project", label: "Project roles" },
  { value: "platform", label: "Platform roles" },
];

/**
 * Settings → Roles: every Role, project roles and platform roles on two tabs, and "New Role". Only Users with
 * access:role:manage get the list; anyone else sees why not.
 */
export default function RolesPage() {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<Kind>("project");

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
    <Container size="lg" px={0} py="xl">
      <Stack gap="lg">
        <div className={classes.header}>
          <div>
            <Title order={1} fz={40} lh={1.05}>
              Roles & access
            </Title>
            <div className={classes.description}>
              A Role bundles Permissions. Platform roles apply across Nimbus; project roles apply to
              a Member in one project.
            </div>
          </div>
          {roles && <Button onClick={() => setCreating(true)}>+ New Role</Button>}
        </div>
        {error && <Alert color="red">{error}</Alert>}
        {!roles && !error && (
          <Center py="xl">
            <Loader />
          </Center>
        )}
        {roles && (
          <>
            <PillTabs
              data={TABS}
              value={kind}
              onChange={(value) => setKind(value as Kind)}
              style={{ alignSelf: "flex-start" }}
            />
            <RoleList roles={roles.filter((role) => role.kind === kind)} />
          </>
        )}
      </Stack>
      {/* Keyed by the tab, so it opens on the kind being looked at. */}
      <NewRoleModal
        key={kind}
        opened={creating}
        initialKind={kind}
        onClose={() => setCreating(false)}
      />
    </Container>
  );
}

/** The Roles of one kind in a panel; each row opens the Role. */
function RoleList({ roles }: { roles: RoleSummary[] }) {
  return (
    <Panel p={8}>
      <div className={classes.columns} aria-hidden>
        <span>Role</span>
        <span>Held by</span>
        <span>Permissions</span>
        <span />
      </div>
      {roles.map((role) => {
        const tag = roleTag(role);
        return (
          <Link key={role.key} to={`/settings/roles/${role.key}`} className={classes.row}>
            <div className={classes.role}>
              <div className={classes.name}>
                {role.name}
                {tag && <span className={classes.tag}>{tag}</span>}
              </div>
              <div className={classes.summary}>
                {role.description}
                <span className={classes.key}>{role.key}</span>
              </div>
            </div>
            <span className={classes.held}>{heldBy(role)}</span>
            <span className={classes.permissions}>{permissionCount(role)}</span>
            <span className={classes.arrow} aria-hidden>
              →
            </span>
          </Link>
        );
      })}
    </Panel>
  );
}
