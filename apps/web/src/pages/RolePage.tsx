import { Alert, Box, Button, Container, Group, Modal, Stack, Text, Title } from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { PillTabs } from "@repo/ui/pill-tabs";
import { Loading } from "@repo/ui/skeleton";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { readOpenedRole, showsPeopleTab } from "../access/openedRole";
import { GrantsEditor } from "../access/GrantsEditor";
import { grantable } from "../access/grants";
import { RenameRoleModal } from "../access/RenameRoleModal";
import { RoleHolders } from "../access/RoleHolders";
import { RoleSummary } from "../access/RoleSummary";
import { useGrantsDraft } from "../access/useGrantsDraft";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { ApiError, api, type CatalogPermission, type Role } from "../api/client";
import {
  loadFailure,
  usePermissionCatalog,
  useRole,
  useRoleDeleted,
  useRolesChanged,
} from "../api/queries";
import { roleCrumbs } from "../settings/crumbs";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { FailedLoadPage } from "../shell/StatusPages";
import classes from "./RolePage.module.css";
import { RoleSkeleton } from "./RoleSkeleton";

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
  // Switched off once the Role is deleted, so nothing fetches it again while the page is leaving.
  const [deleted, setDeleted] = useState(false);
  const roleQuery = useRole(key, !deleted);
  const catalogQuery = usePermissionCatalog();
  // Both the Role and the catalog are needed before anything shows.
  const role = catalogQuery.data ? (roleQuery.data ?? null) : null;
  const catalog = catalogQuery.data ?? [];
  const error = loadFailure(roleQuery) ?? loadFailure(catalogQuery);
  const rolesChanged = useRolesChanged();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Counts resets: the Permissions start again from the defaults, whatever was ticked and unsaved.
  const [resets, setResets] = useState(0);
  const platformPermissions = usePlatformPermissions();
  // The Roles list says which kind of Role it opened, so the skeleton can match it.
  const location = useLocation();
  const opened = readOpenedRole(location.state);
  const navigate = useNavigate();

  const hasPeople = role !== null && showsPeopleTab(role.kind, role.key, platformPermissions);

  // The hint was only for the skeleton; once the Role is here it would go stale (after a rename, on a reload).
  const hinted = location.state !== null;
  useEffect(() => {
    if (role && hinted) navigate(location, { replace: true, state: null });
  }, [role, hinted, navigate, location]);

  // Showing the cached Role while it refreshes: if the refresh fails, what is on screen may be out of date.
  useEffect(() => {
    if (roleQuery.isRefetchError)
      toast.warning(
        "Couldn't refresh this Role; what you see may be out of date. Reload the page to see the latest.",
      );
  }, [roleQuery.isRefetchError, roleQuery.errorUpdatedAt]);

  // Whatever changed the Role (rename, save, reset), a refusal shown from an earlier try no longer applies.
  function changed(next: Role) {
    setFailure(null);
    void rolesChanged(next);
  }

  // Not found, no access, offline or a server error: the status page takes the place of the Role.
  if (error) {
    return (
      <FailedLoadPage
        failure={error}
        onRetry={() => {
          if (loadFailure(roleQuery)) void roleQuery.refetch();
          if (loadFailure(catalogQuery)) void catalogQuery.refetch();
        }}
      />
    );
  }

  return (
    <Container size="lg" px={0} py="xl">
      <Box mb="md">
        <BreadcrumbTrail crumbs={roleCrumbs(role)} />
      </Box>
      {!role && (
        <Loading>
          <RoleSkeleton
            opened={opened}
            tabs={opened !== undefined && showsPeopleTab(opened.kind, key, platformPermissions)}
          />
        </Loading>
      )}
      {role && (
        <Stack gap="lg">
          {failure && <Alert color="red">{failure}</Alert>}
          <RoleHeader role={role} />
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
          <RoleWorkspace
            key={resets}
            role={role}
            catalog={catalog}
            hasPeople={hasPeople}
            onChanged={changed}
            onRename={() => setRenaming(true)}
            onConfirm={setConfirming}
          />
          {renaming && (
            <RenameRoleModal role={role} onClose={() => setRenaming(false)} onChanged={changed} />
          )}
          <ConfirmModal
            role={role}
            confirming={confirming}
            onClose={() => setConfirming(null)}
            onChanged={(next) => {
              changed(next);
              if (confirming === "reset") setResets((count) => count + 1);
            }}
            onDeleted={() => setDeleted(true)}
            onFailure={setFailure}
          />
        </Stack>
      )}
    </Container>
  );
}

/**
 * The tabs, then the Permissions beside the summary panel. The unsaved Grants live here, above the tabs, so ticks
 * survive a visit to People; below about 900px the summary moves under the Permissions.
 */
function RoleWorkspace({
  role,
  catalog,
  hasPeople,
  onChanged,
  onRename,
  onConfirm,
}: {
  role: Role;
  catalog: CatalogPermission[];
  hasPeople: boolean;
  onChanged: (role: Role) => void;
  onRename: () => void;
  onConfirm: (action: "reset" | "delete") => void;
}) {
  const [tab, setTab] = useState<"permissions" | "people">("permissions");
  const grants = useGrantsDraft(role, onChanged);
  // The People tab appears once the signed-in User's Permissions arrive; without it there is only Permissions.
  const current = hasPeople ? tab : "permissions";

  return (
    <>
      {hasPeople && (
        <PillTabs
          data={[
            { value: "permissions", label: "Permissions" },
            { value: "people", label: "People" },
          ]}
          value={current}
          onChange={(value) => setTab(value as typeof tab)}
          style={{ alignSelf: "flex-start" }}
        />
      )}
      <div className={classes.layout}>
        <div className={classes.main}>
          {/* Only mounted while shown, so the Scope pills measure themselves in a visible page; the draft lives above. */}
          {current === "permissions" && (
            <GrantsEditor role={role} catalog={catalog} grants={grants} />
          )}
          {hasPeople && (
            <div hidden={current !== "people"}>
              <RoleHolders role={role} />
            </div>
          )}
        </div>
        <RoleSummary
          role={role}
          granted={grants.draft.size}
          grantable={grantable(role.kind, catalog).length}
          showSave={current === "permissions"}
          changes={grants.changes}
          saving={grants.saving}
          onSave={grants.save}
          onDiscard={grants.discard}
          onRename={onRename}
          onReset={() => onConfirm("reset")}
          onDelete={() => onConfirm("delete")}
        />
      </div>
    </>
  );
}

/** The Role's name and description. */
function RoleHeader({ role }: { role: Role }) {
  return (
    <div>
      <Title order={1} fz={40} lh={1.05}>
        {role.name}
      </Title>
      {role.description && (
        <Text mt={8} maw={620} c="var(--color-accent-2-700)">
          {role.description}
        </Text>
      )}
    </div>
  );
}

/** Asks before resetting a built-in Role to its defaults or deleting a custom one, then does it. */
function ConfirmModal({
  role,
  confirming,
  onClose,
  onChanged,
  onDeleted,
  onFailure,
}: {
  role: Role;
  confirming: "reset" | "delete" | null;
  onClose: () => void;
  onChanged: (role: Role) => void;
  onDeleted: () => void;
  onFailure: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const roleDeleted = useRoleDeleted();
  const resetRole = useMutation({ mutationFn: () => api.resetRole(role.key, role.version) });
  const deleteRole = useMutation({ mutationFn: () => api.deleteRole(role.key) });
  // The last action asked about, so the window's text doesn't change while it fades out.
  const [action, setAction] = useState(confirming);
  if (confirming && confirming !== action) setAction(confirming);

  async function confirm() {
    onFailure(null);
    try {
      if (confirming === "reset") {
        onChanged(await resetRole.mutateAsync());
        toast.success(`${role.name} is back to its defaults.`);
      } else {
        await deleteRole.mutateAsync();
        onDeleted();
        void roleDeleted(role.key);
        toast.success(`Deleted ${role.name}.`);
        navigate("/settings/roles", { replace: true });
      }
      onClose();
    } catch (error) {
      onClose();
      onFailure(
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <Modal
      opened={confirming !== null}
      onClose={onClose}
      title={action === "reset" ? "Reset to defaults?" : `Delete ${role.name}?`}
    >
      <Text size="sm" mb="md">
        {action === "reset"
          ? "Its name, description and Permissions go back to what Nimbus ships with. Your changes are lost."
          : "This can't be undone. A Role someone still holds can't be deleted."}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          color={action === "delete" ? "red" : undefined}
          loading={resetRole.isPending || deleteRole.isPending}
          onClick={confirm}
        >
          {action === "reset" ? "Reset" : "Delete"}
        </Button>
      </Group>
    </Modal>
  );
}
