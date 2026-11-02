import { ApiError } from "@repo/api";
import { Button, Group, Modal, Text } from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, type Issue } from "../api/client";
import { useIssueDeleted } from "../api/queries";

/**
 * "Delete NIM-12?", asked before an Issue is deleted: it says the delete is for good, deletes on its button and goes
 * back to the project's Issues. While deleting it can't be closed; a refusal is shown and the Issue stays.
 */
export function DeleteIssueDialog({
  issue,
  opened,
  onClose,
}: {
  issue: Issue;
  opened: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const issueDeleted = useIssueDeleted();
  const [deleting, setDeleting] = useState(false);

  async function deleteIssue() {
    setDeleting(true);
    try {
      await api.deleteIssue(issue.key);
      toast.success(`${issue.key} deleted.`);
      void navigate(`/projects/${issue.key.slice(0, issue.key.lastIndexOf("-"))}/issues`);
      issueDeleted(issue.key);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete the Issue.");
      onClose();
      setDeleting(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Delete ${issue.key}?`}
      size={420}
      closeOnEscape={!deleting}
      closeOnClickOutside={!deleting}
      withCloseButton={!deleting}
    >
      <Text size="sm" c="dimmed" mb="lg">
        “{issue.title}” and its history will be gone for good. This can't be undone.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button color="red" onClick={() => void deleteIssue()} loading={deleting}>
          Delete
        </Button>
      </Group>
    </Modal>
  );
}
