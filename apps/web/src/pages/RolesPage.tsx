import { IconArrowRight } from "@tabler/icons-react";
import { Glyph } from "@repo/ui/glyph";
import { Button, Container, Stack, Title, VisuallyHidden } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { PillTabs } from "@repo/ui/pill-tabs";
import { Loading } from "@repo/ui/skeleton";
import { Tag } from "@repo/ui/tag";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";
import { NewRoleModal } from "../access/NewRoleModal";
import { heldBy, permissionCount, roleTag } from "../access/roleRow";
import { api, type Kind, type RoleSummary } from "../api/client";
import { failedLoad, type FailedLoad } from "../api/failure";
import { FailedLoadPage } from "../shell/StatusPages";
import classes from "./RolesPage.module.css";
import { RoleListSkeleton } from "./RoleListSkeleton";
import { openedRole } from "./openedRole";

const TABS: { value: Kind; label: string }[] = [
  { value: "project", label: "Project roles" },
  { value: "platform", label: "Platform roles" },
];

/** The open tab, kept in the address (?kind=platform) so coming back from a Role returns to it. */
function useKindTab(): [Kind, (kind: Kind) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const kind: Kind = searchParams.get("kind") === "platform" ? "platform" : "project";
  function setKind(next: Kind) {
    setSearchParams(next === "project" ? {} : { kind: next }, { replace: true });
  }
  return [kind, setKind];
}

/**
 * Settings → Roles: every Role, project roles and platform roles on two tabs, and "New Role". Only Users with
 * access:role:manage get the list; anyone else sees why not.
 */
export default function RolesPage() {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [error, setError] = useState<FailedLoad | null>(null);
  // Bumped by Try again on the status page, to load the Roles again.
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useKindTab();

  useEffect(() => {
    let current = true;
    api
      .roles()
      .then((found) => {
        if (current) setRoles(found);
      })
      .catch((failure) => {
        if (current) setError(failedLoad(failure));
      });
    return () => {
      current = false;
    };
  }, [attempt]);

  // No access, offline or a server error: the status page takes the place of the list.
  if (error) {
    return (
      <FailedLoadPage
        failure={error}
        onRetry={() => {
          setError(null);
          setAttempt((tries) => tries + 1);
        }}
      />
    );
  }

  return (
    <Container size="lg" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={settingsCrumbs("Roles & access")} />
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
        {!roles && (
          <Loading>
            <RoleListSkeleton />
          </Loading>
        )}
        {roles && (
          <>
            <PillTabs
              data={TABS}
              value={kind}
              onChange={(value) => setKind(value as Kind)}
              style={{ alignSelf: "flex-start" }}
            />
            <RoleList
              label={TABS.find((tab) => tab.value === kind)!.label}
              roles={roles.filter((role) => role.kind === kind)}
            />
          </>
        )}
      </Stack>
      <NewRoleModal opened={creating} initialKind={kind} onClose={() => setCreating(false)} />
    </Container>
  );
}

/**
 * The Roles of one kind in a panel; each row opens the Role. A list of links, with "Held by" said to screen readers,
 * since the column titles above are only visual.
 */
function RoleList({ label, roles }: { label: string; roles: RoleSummary[] }) {
  return (
    <Panel p={8}>
      <div className={classes.columns} aria-hidden>
        <span>Role</span>
        <span>Held by</span>
        <span>Permissions</span>
        <span />
      </div>
      {roles.length === 0 ? (
        <p className={classes.empty}>No {label.toLowerCase()} yet.</p>
      ) : (
        <ul className={classes.list} aria-label={label}>
          {roles.map((role) => {
            const tag = roleTag(role);
            return (
              <li key={role.key}>
                <Link
                  to={`/settings/roles/${role.key}`}
                  state={openedRole(role)}
                  className={classes.row}
                >
                  <div className={classes.role}>
                    <div className={classes.name}>
                      {role.name}
                      {tag && <Tag>{tag}</Tag>}
                    </div>
                    <div className={classes.summary}>
                      {role.description && <span>{role.description}</span>}
                      <span className={classes.key}>{role.key}</span>
                    </div>
                  </div>
                  <span className={classes.held}>
                    <VisuallyHidden>Held by </VisuallyHidden>
                    {heldBy(role)}
                  </span>
                  <span className={classes.permissions}>{permissionCount(role)}</span>
                  <span className={classes.arrow}>
                    <Glyph icon={IconArrowRight} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
