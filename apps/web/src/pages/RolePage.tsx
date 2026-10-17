import {
  Alert,
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { PillTabs } from "@repo/ui/pill-tabs";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { GrantsEditor } from "../access/GrantsEditor";
import { grantable } from "../access/grants";
import { RenameRoleModal } from "../access/RenameRoleModal";
import { RoleHolders } from "../access/RoleHolders";
import { RoleSummary } from "../access/RoleSummary";
import { useGrantsDraft } from "../access/useGrantsDraft";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { ApiError, api, type CatalogPermission, type Role } from "../api/client";
import { failedLoad, type FailedLoad } from "../api/failure";
import { roleCrumbs } from "../settings/crumbs";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { FailedLoadPage } from "../shell/StatusPages";
import classes from "./RolePage.module.css";

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
  const [error, setError] = useState<FailedLoad | null>(null);
  // Bumped by Try again on the status page, to load the Role again.
  const [attempt, setAttempt] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
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
        if (current) setError(failedLoad(failure));
      });
    return () => {
      current = false;
    };
  }, [key, attempt]);

  // Everyone is held by every signed-in User, and project roles are given on a project's Members page.
  const hasPeople =
    role !== null &&
    role.kind === "platform" &&
    role.key !== "everyone" &&
    platformPermissions.includes("access:role:assign");

  // Whatever changed the Role (rename, save, reset), a refusal shown from an earlier try no longer applies.
  function changed(next: Role) {
    setFailure(null);
    setRole(next);
  }

  // The holder count in the summary changes when someone is given or loses the Role.
  function refresh() {
    api
      .role(key)
      .then(setRole)
      .catch(() =>
        toast.warning("Couldn't refresh this Role's holder count; reload the page to see it."),
      );
  }

  // Not found, no access, offline or a server error: the status page takes the place of the Role.
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
      <Box mb="md">
        <BreadcrumbTrail crumbs={roleCrumbs(role)} />
      </Box>
      {!role && (
        <Center py="xl">
          <Loader />
        </Center>
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
            role={role}
            catalog={catalog}
            hasPeople={hasPeople}
            onChanged={changed}
            onRefresh={refresh}
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
            onChanged={changed}
            onFailure={setFailure}
          />
        </Stack>
      )}
    </Container>
  );
}

/**
 * The Permissions and People tabs beside the summary panel. The unsaved Grants live here, above the tabs, so ticks
 * survive a visit to People; below about 900px the summary moves under the tabs.
 */
function RoleWorkspace({
  role,
  catalog,
  hasPeople,
  onChanged,
  onRefresh,
  onRename,
  onConfirm,
}: {
  role: Role;
  catalog: CatalogPermission[];
  hasPeople: boolean;
  onChanged: (role: Role) => void;
  onRefresh: () => void;
  onRename: () => void;
  onConfirm: (action: "reset" | "delete") => void;
}) {
  const [tab, setTab] = useState<"permissions" | "people">("permissions");
  const grants = useGrantsDraft(role, onChanged);
  // The People tab appears once the signed-in User's Permissions arrive; without it there is only Permissions.
  const current = hasPeople ? tab : "permissions";

  return (
    <div className={classes.layout}>
      <div className={classes.main}>
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
        {/* Only mounted while shown, so the Scope pills measure themselves in a visible page; the draft lives above. */}
        {current === "permissions" && (
          <GrantsEditor role={role} catalog={catalog} grants={grants} />
        )}
        {hasPeople && (
          <div hidden={current !== "people"}>
            <RoleHolders role={role} onChanged={onRefresh} />
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
  onFailure,
}: {
  role: Role;
  confirming: "reset" | "delete" | null;
  onClose: () => void;
  onChanged: (role: Role) => void;
  onFailure: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // The last action asked about, so the window's text doesn't change while it fades out.
  const [action, setAction] = useState(confirming);
  if (confirming && confirming !== action) setAction(confirming);

  async function confirm() {
    setBusy(true);
    onFailure(null);
    try {
      if (confirming === "reset") {
        onChanged(await api.resetRole(role.key, role.version));
        toast.success(`${role.name} is back to its defaults.`);
      } else {
        await api.deleteRole(role.key);
        toast.success(`Deleted ${role.name}.`);
        navigate("/settings/roles", { replace: true });
      }
      onClose();
    } catch (error) {
      onClose();
      onFailure(
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
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
        <Button color={action === "delete" ? "red" : undefined} loading={busy} onClick={confirm}>
          {action === "reset" ? "Reset" : "Delete"}
        </Button>
      </Group>
    </Modal>
  );
}
