import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ApiError } from "@repo/api";
import {
  ActionIcon,
  Alert,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { api, type ProjectStatus } from "../api/client";
import {
  loadFailure,
  queryKeys,
  refreshFailed,
  useProject,
  useProjectStatuses,
  useStatusesChanged,
} from "../api/queries";
import { DeleteStatusDialog } from "../issues/DeleteStatusDialog";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";
import { ProjectListSkeleton } from "./ProjectListSkeleton";

const MAX_STATUSES = 20;
const CATEGORIES: { value: ProjectStatus["category"]; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

function failureMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** One Status: a handle to drag it, its name (renamed in place), its category and a delete button. */
function StatusRow({
  status,
  disabled,
  onRename,
  onCategory,
  onDelete,
}: {
  status: ProjectStatus;
  disabled: boolean;
  onRename: (status: ProjectStatus, name: string) => Promise<boolean>;
  onCategory: (status: ProjectStatus, category: ProjectStatus["category"]) => void;
  onDelete: (status: ProjectStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status.id,
    disabled,
  });
  const [name, setName] = useState(status.name);
  const [error, setError] = useState<string | null>(null);
  // A name saved elsewhere (or refused and put back) replaces what was typed.
  const [seen, setSeen] = useState(status.name);
  if (seen !== status.name) {
    setSeen(status.name);
    setName(status.name);
  }

  async function commit() {
    const next = name.trim();
    if (next === status.name) {
      setName(status.name);
      setError(null);
      return;
    }
    const saved = await onRename(status, next);
    if (saved) setError(null);
    else setError("Not saved");
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: "relative",
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start" py={6}>
        <ActionIcon
          variant="subtle"
          color="gray"
          mt={4}
          aria-label={`Drag ${status.name}`}
          disabled={disabled}
          style={{ touchAction: "none", cursor: disabled ? "default" : "grab" }}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={18} />
        </ActionIcon>
        <TextInput
          style={{ flex: 1 }}
          aria-label={`Name of ${status.name}`}
          value={name}
          maxLength={30}
          disabled={disabled}
          error={error}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(status.name);
              setError(null);
            }
          }}
        />
        <Select
          w={150}
          aria-label={`Category of ${status.name}`}
          data={CATEGORIES}
          value={status.category}
          allowDeselect={false}
          disabled={disabled}
          onChange={(value) => {
            const category = CATEGORIES.find((option) => option.value === value)?.value;
            if (category && category !== status.category) onCategory(status, category);
          }}
        />
        <ActionIcon
          variant="subtle"
          color="red"
          mt={4}
          aria-label={`Delete ${status.name}`}
          disabled={disabled}
          onClick={() => onDelete(status)}
        >
          <IconTrash size={18} />
        </ActionIcon>
      </Group>
    </div>
  );
}

/**
 * A project's Statuses settings: add a Status in a category, rename it in place, change its category, drag the rows
 * into order and delete one after choosing where its Issues go. Everything saves as it is done; the server keeps at
 * least one Status in each category and refuses changes in an Archived project, and its refusals are shown.
 */
export default function StatusesPage() {
  const { key = "" } = useParams();
  const projectQuery = useProject(key);
  const project = projectQuery.data;
  const statusesQuery = useProjectStatuses(project?.key);
  const statuses = statusesQuery.data ?? [];
  const client = useQueryClient();
  const statusesChanged = useStatusesChanged();
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<ProjectStatus["category"]>("TODO");
  const [nameError, setNameError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ProjectStatus | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const failure = loadFailure(statusesQuery) ?? loadFailure(projectQuery);
  const archived = project?.archived ?? false;

  if (
    projectQuery.error instanceof ApiError &&
    projectQuery.error.status === 404 &&
    !projectQuery.isFetching
  ) {
    return (
      <StatusPage
        eyebrow="Error 404"
        title="Project not found."
        body="Check the project link or ask a project Member for help."
        code="404"
        name="Not found"
        actions={<PrimaryAction to="/projects">Go to Projects</PrimaryAction>}
      />
    );
  }
  if (failure) {
    return (
      <FailedLoadPage
        failure={failure}
        onRetry={() => {
          void projectQuery.refetch();
          void statusesQuery.refetch();
        }}
      />
    );
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    setAdding(true);
    setNameError(null);
    try {
      await api.addStatus(project.key, { name: newName.trim(), category: newCategory });
      setNewName("");
      statusesChanged(project.key);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors.name) {
        setNameError(error.fieldErrors.name);
      } else if (error instanceof ApiError && error.code === "status_name_taken") {
        setNameError(error.message);
      } else {
        toast.error(failureMessage(error, "Couldn't add the Status."));
      }
    }
    setAdding(false);
  }

  async function rename(status: ProjectStatus, name: string) {
    if (!project) return false;
    try {
      await api.editStatus(project.key, status.id, { name });
      statusesChanged(project.key);
      return true;
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't rename the Status."));
      return false;
    }
  }

  async function changeCategory(status: ProjectStatus, category: ProjectStatus["category"]) {
    if (!project) return;
    try {
      await api.editStatus(project.key, status.id, { category });
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't change the category."));
    }
    statusesChanged(project.key);
  }

  async function dropped(event: DragEndEvent) {
    if (!project || !event.over || event.active.id === event.over.id) return;
    const from = statuses.findIndex((status) => status.id === event.active.id);
    const to = statuses.findIndex((status) => status.id === event.over?.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(statuses, from, to).map((status, position) => ({
      ...status,
      position,
    }));
    // Shown at once; put right by the refresh if the server refuses.
    client.setQueryData(queryKeys.projectStatuses(project.key), reordered);
    try {
      await api.reorderStatuses(
        project.key,
        reordered.map((status) => status.id),
      );
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't save the new order."));
    }
    statusesChanged(project.key);
  }

  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail
          crumbs={[
            { label: "Projects", to: "/projects" },
            project
              ? { label: project.name, to: `/projects/${encodeURIComponent(project.key)}` }
              : { label: "", pending: true },
            { label: "Statuses" },
          ]}
        />
        <Title order={1}>Statuses</Title>
        {!project || statusesQuery.isPending ? (
          <Loading>
            <ProjectListSkeleton />
          </Loading>
        ) : (
          <>
            {refreshFailed(statusesQuery) && (
              <Alert color="yellow" title="Couldn't refresh the Statuses">
                Showing the last loaded Statuses.{" "}
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => void statusesQuery.refetch()}
                >
                  Try again
                </Button>
              </Alert>
            )}
            {archived && (
              <Alert color="gray" title="This project is archived">
                Its Statuses can't be changed.
              </Alert>
            )}
            <Panel p="lg">
              <Stack gap="xs">
                {statuses.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    This project has no Statuses yet. To do, In progress and Done are made with its
                    first Issue, or when you add a Status.
                  </Text>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => void dropped(event)}
                  >
                    <SortableContext
                      items={statuses.map((status) => status.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {statuses.map((status) => (
                        <StatusRow
                          key={status.id}
                          status={status}
                          disabled={archived}
                          onRename={rename}
                          onCategory={(row, category) => void changeCategory(row, category)}
                          onDelete={setDeleting}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </Stack>
            </Panel>
            {!archived && (
              <Panel p="lg">
                <form onSubmit={(event) => void add(event)}>
                  <Group align="flex-start" gap="sm">
                    <TextInput
                      style={{ flex: 1 }}
                      label="New Status"
                      placeholder="In review"
                      maxLength={30}
                      value={newName}
                      error={nameError}
                      onChange={(event) => {
                        setNewName(event.currentTarget.value);
                        setNameError(null);
                      }}
                    />
                    <Select
                      w={150}
                      label="Category"
                      data={CATEGORIES}
                      value={newCategory}
                      allowDeselect={false}
                      onChange={(value) =>
                        setNewCategory(
                          CATEGORIES.find((option) => option.value === value)?.value ?? "TODO",
                        )
                      }
                    />
                    <Button
                      type="submit"
                      mt={25}
                      loading={adding}
                      disabled={newName.trim() === "" || statuses.length >= MAX_STATUSES}
                    >
                      Add Status
                    </Button>
                  </Group>
                  {statuses.length >= MAX_STATUSES && (
                    <Text size="sm" c="dimmed" mt="xs">
                      A project has at most {MAX_STATUSES} Statuses.
                    </Text>
                  )}
                </form>
              </Panel>
            )}
          </>
        )}
      </Stack>
      <DeleteStatusDialog
        projectKey={project?.key ?? key}
        status={deleting}
        statuses={statuses}
        onClose={() => setDeleting(null)}
      />
    </Container>
  );
}
