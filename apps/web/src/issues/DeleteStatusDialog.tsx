import { ApiError } from "@repo/api";
import { Button, Group, Modal, Select, Text } from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type ProjectStatus } from "../api/client";
import { useStatusesChanged } from "../api/queries";

/**
 * "Delete In review?", asked before a Status is deleted. A Status with Issues asks where they go (**Move Issues
 * to**, the first other Status of the same category chosen); one without just goes. The last Status of a category
 * can't be deleted, which the server also enforces. While deleting it can't be closed; a refusal is shown and the
 * Status stays.
 */
export function DeleteStatusDialog({
  projectKey,
  status,
  statuses,
  onClose,
}: {
  projectKey: string;
  status: ProjectStatus | null;
  statuses: ProjectStatus[];
  onClose: () => void;
}) {
  const statusesChanged = useStatusesChanged();
  const [deleting, setDeleting] = useState(false);
  // Remembers whose Status it was chosen for, so a choice made for one Status is never used for another.
  const [chosenFor, setChosenFor] = useState<{ statusId: string; moveTo: string } | null>(null);
  // Only one Issue is asked for: the total says whether there is anything to move.
  const count = useQuery({
    queryKey: ["issues", "status-count", projectKey, status?.id],
    queryFn: () => api.issues(projectKey, { status: status?.name, size: 1 }),
    enabled: status !== null,
    gcTime: 0,
  });

  const others = statuses.filter((other) => other.id !== status?.id);
  const soleOfCategory =
    status !== null && !others.some((other) => other.category === status.category);
  const chosen = chosenFor !== null && chosenFor.statusId === status?.id ? chosenFor.moveTo : null;
  const moveTo =
    (others.some((other) => other.id === chosen) ? chosen : null) ??
    others.find((other) => other.category === status?.category)?.id ??
    null;
  const hasIssues = (count.data?.total ?? 0) > 0;
  const ready = count.data !== undefined && !soleOfCategory && (!hasIssues || moveTo !== null);

  async function deleteStatus() {
    if (!status) return;
    setDeleting(true);
    try {
      await api.deleteStatus(projectKey, status.id, hasIssues ? (moveTo ?? undefined) : undefined);
      toast.success(`${status.name} deleted.`);
    } catch (error) {
      // Already deleted by someone else: it is gone, which is what was asked for.
      if (!(error instanceof ApiError && error.status === 404)) {
        toast.error(error instanceof ApiError ? error.message : "Couldn't delete the Status.");
      }
    }
    setDeleting(false);
    setChosenFor(null);
    statusesChanged(projectKey);
    onClose();
  }

  return (
    <Modal
      opened={status !== null}
      onClose={onClose}
      title={status ? `Delete ${status.name}?` : ""}
      size={420}
      closeOnEscape={!deleting}
      closeOnClickOutside={!deleting}
      withCloseButton={!deleting}
    >
      {soleOfCategory ? (
        <Text size="sm" c="dimmed" mb="lg">
          A project keeps at least one Status in each category. Add another one to this category
          first.
        </Text>
      ) : hasIssues ? (
        <>
          <Text size="sm" c="dimmed" mb="md">
            {count.data?.total === 1 ? "1 Issue is" : `${count.data?.total} Issues are`} in this
            Status. Choose where they go.
          </Text>
          <Select
            label="Move Issues to"
            data={others.map((other) => ({ value: other.id, label: other.name }))}
            value={moveTo}
            onChange={(value) =>
              status && value && setChosenFor({ statusId: status.id, moveTo: value })
            }
            allowDeselect={false}
            mb="lg"
          />
        </>
      ) : (
        <Text size="sm" c="dimmed" mb="lg">
          {count.isError
            ? "Couldn't check whether this Status has Issues."
            : count.data
              ? "No Issues are in this Status."
              : "Checking for Issues…"}
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          color="red"
          onClick={() => void deleteStatus()}
          loading={deleting}
          disabled={!ready}
        >
          Delete
        </Button>
      </Group>
    </Modal>
  );
}
