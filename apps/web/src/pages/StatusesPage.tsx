import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
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
import { ActionIcon, Alert, Button, Menu, Stack, Text, TextInput, Title } from "@mantine/core";
import { Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import {
  IconCheck,
  IconChevronRight,
  IconDots,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useParams } from "react-router";
import { api, type ProjectStatus } from "../api/client";
import {
  loadFailure,
  queryKeys,
  refreshFailed,
  useIssueCounts,
  useProject,
  useProjectStatuses,
  useStatusesChanged,
} from "../api/queries";
import { DeleteStatusDialog } from "../issues/DeleteStatusDialog";
import { useIssuePermissions } from "../issues/useIssuePermissions";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";
import { StaleNotice } from "../shell/StaleNotice";
import { PillListSkeleton } from "./PillListSkeleton";
import classes from "./StatusesPage.module.css";

const MAX_STATUSES = 20;

type Category = ProjectStatus["category"];

const CATEGORIES: { value: Category; label: string; blurb: string }[] = [
  {
    value: "TODO",
    label: "To do",
    blurb: "Not started yet. New issues land in the default status.",
  },
  {
    value: "IN_PROGRESS",
    label: "In progress",
    blurb: "Being worked on. Counts as open on the board and in reports.",
  },
  { value: "DONE", label: "Done", blurb: "Finished. Issues here count as closed." },
];

const NEEDS_ONE = "Each category needs at least one status.";

/** The project's Statuses under their categories, each in the project's order. */
type Groups = Record<Category, ProjectStatus[]>;

function groupsOf(statuses: ProjectStatus[]): Groups {
  const groups: Groups = { TODO: [], IN_PROGRESS: [], DONE: [] };
  for (const status of statuses) groups[status.category].push(status);
  return groups;
}

const containerId = (category: Category) => `category:${category}`;

/** The category an id stands for: a Status of it, or the card itself. */
function categoryOf(groups: Groups, id: string): Category | undefined {
  const card = CATEGORIES.find((category) => containerId(category.value) === id);
  if (card) return card.value;
  return CATEGORIES.find((category) => groups[category.value].some((status) => status.id === id))
    ?.value;
}

/**
 * The groups after the Status `activeId` is dropped on `overId` (a Status, or a card's own space): into that Status's
 * place, in its category. Dropped on a card, it goes to the end.
 */
function dropped(groups: Groups, activeId: string, overId: string): Groups {
  const from = categoryOf(groups, activeId);
  const to = categoryOf(groups, overId);
  if (!from || !to) return groups;
  const active = groups[from].find((status) => status.id === activeId);
  if (!active) return groups;
  const overIndex = groups[to].findIndex((status) => status.id === overId);
  if (from === to) {
    const fromIndex = groups[from].findIndex((status) => status.id === activeId);
    if (overIndex < 0 || overIndex === fromIndex) return groups;
    return { ...groups, [from]: arrayMove(groups[from], fromIndex, overIndex) };
  }
  const target = groups[to].slice();
  target.splice(overIndex < 0 ? target.length : overIndex, 0, { ...active, category: to });
  return {
    ...groups,
    [from]: groups[from].filter((status) => status.id !== activeId),
    [to]: target,
  };
}

function failureMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const issuesLabel = (count: number) => `${count} ${count === 1 ? "issue" : "issues"}`;

/** What a row shows: the colour dot, the name and the default badge, then the count. */
function RowBody({
  status,
  count,
  handle,
  children,
}: {
  status: ProjectStatus;
  count: number;
  handle: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      {handle}
      <span className={classes.dot} data-category={status.category} aria-hidden />
      {children ?? <span className={classes.name}>{status.name}</span>}
      {status.isDefault && (
        <span className={classes.badge}>
          <IconStar size={11} aria-hidden /> Default
        </span>
      )}
      <span className={classes.spacer} />
      <span className={classes.issues}>{issuesLabel(count)}</span>
    </>
  );
}

/** One Status: its name (click to rename), how many Issues it has, and its actions; shown on hover or focus. */
function StatusRow({
  status,
  count,
  readOnly,
  onlyOneInCategory,
  renaming,
  onStartRename,
  onStopRename,
  onRename,
  onCategory,
  onDefault,
  onDelete,
}: {
  status: ProjectStatus;
  count: number;
  readOnly: boolean;
  onlyOneInCategory: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onStopRename: () => void;
  onRename: (status: ProjectStatus, name: string) => Promise<string | null>;
  onCategory: (status: ProjectStatus, category: Category) => void;
  onDefault: (status: ProjectStatus) => void;
  onDelete: (status: ProjectStatus) => void;
}) {
  // Alone in its category it can't leave it, and there is nobody to swap places with.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status.id,
    data: { category: status.category },
    disabled: { draggable: readOnly || onlyOneInCategory, droppable: false },
    animateLayoutChanges: () => false,
  });
  const [name, setName] = useState(status.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Renaming starts from the name as it is now, however it was left the last time.
  const [startedFor, setStartedFor] = useState<boolean>(false);
  if (renaming !== startedFor) {
    setStartedFor(renaming);
    if (renaming) {
      setName(status.name);
      setError(null);
    }
  }

  async function save() {
    if (saving) return;
    const next = name.trim();
    if (next === status.name || next === "") {
      onStopRename();
      return;
    }
    setSaving(true);
    const refusal = await onRename(status, next);
    setSaving(false);
    if (refusal === null) onStopRename();
    else setError(refusal);
  }

  const handle = (
    <ActionIcon
      variant="subtle"
      color="gray"
      className={classes.handle}
      aria-label={`Drag ${status.name}`}
      disabled={readOnly || onlyOneInCategory}
      {...attributes}
      {...listeners}
    >
      <IconGripVertical size={18} />
    </ActionIcon>
  );

  return (
    <div
      ref={setNodeRef}
      className={classes.row}
      data-slot={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {renaming ? (
        <>
          <span className={classes.dot} data-category={status.category} aria-hidden />
          <TextInput
            className={classes.edit}
            aria-label={`Name of ${status.name}`}
            size="sm"
            value={name}
            maxLength={30}
            error={error}
            disabled={saving}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setError(null);
            }}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              } else if (event.key === "Escape") {
                event.preventDefault();
                onStopRename();
              }
            }}
          />
        </>
      ) : (
        <RowBody status={status} count={count} handle={handle}>
          <button
            type="button"
            className={classes.name}
            disabled={readOnly}
            aria-label={`Rename ${status.name}`}
            onClick={onStartRename}
          >
            {status.name}
          </button>
        </RowBody>
      )}
      {!renaming && !readOnly && (
        <>
          <ActionIcon
            variant="subtle"
            color="gray"
            className={classes.action}
            aria-label={`Edit ${status.name}`}
            onClick={onStartRename}
          >
            <IconPencil size={16} />
          </ActionIcon>
          <Menu
            position="bottom-end"
            width={232}
            withinPortal
            classNames={{ dropdown: classes.menu, item: classes.menuItem }}
          >
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                className={classes.action}
                aria-label={`More actions for ${status.name}`}
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={onStartRename}>
                Rename
              </Menu.Item>
              <Menu.Sub>
                <Menu.Sub.Target>
                  <Menu.Sub.Item
                    rightSection={
                      <>
                        <span className={classes.menuValue}>
                          {CATEGORIES.find((category) => category.value === status.category)?.label}
                        </span>
                        <IconChevronRight size={14} />
                      </>
                    }
                    leftSection={
                      <span className={classes.dot} data-category={status.category} aria-hidden />
                    }
                  >
                    Category
                  </Menu.Sub.Item>
                </Menu.Sub.Target>
                <Menu.Sub.Dropdown className={classes.menu}>
                  {CATEGORIES.map((category) => (
                    <Menu.Item
                      key={category.value}
                      leftSection={
                        <span className={classes.dot} data-category={category.value} aria-hidden />
                      }
                      rightSection={
                        category.value === status.category ? <IconCheck size={14} /> : undefined
                      }
                      disabled={onlyOneInCategory && category.value !== status.category}
                      title={
                        onlyOneInCategory && category.value !== status.category
                          ? NEEDS_ONE
                          : undefined
                      }
                      onClick={() => {
                        if (category.value !== status.category) onCategory(status, category.value);
                      }}
                    >
                      {category.label}
                    </Menu.Item>
                  ))}
                </Menu.Sub.Dropdown>
              </Menu.Sub>
              <Menu.Item
                leftSection={<IconStar size={14} />}
                rightSection={
                  status.category !== "TODO" ? (
                    <span className={classes.hint}>To do only</span>
                  ) : null
                }
                disabled={status.category !== "TODO" || status.isDefault}
                onClick={() => onDefault(status)}
              >
                Set as default
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                disabled={onlyOneInCategory}
                title={onlyOneInCategory ? NEEDS_ONE : undefined}
                onClick={() => onDelete(status)}
              >
                Delete…
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </>
      )}
    </div>
  );
}

/** "+ Add status" at the bottom of a card; opened, it is a row with a name field and Add / Cancel. */
function AddStatus({
  category,
  label,
  disabled,
  adding,
  onOpen,
  onClose,
  onAdd,
}: {
  category: Category;
  label: string;
  disabled: boolean;
  adding: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (category: Category, name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedBefore, setOpenedBefore] = useState(false);
  if (adding !== openedBefore) {
    setOpenedBefore(adding);
    if (adding) {
      setName("");
      setError(null);
    }
  }

  async function add() {
    const next = name.trim();
    if (next === "" || saving) return;
    setSaving(true);
    const refusal = await onAdd(category, next);
    setSaving(false);
    if (refusal === null) onClose();
    else setError(refusal);
  }

  if (!adding) {
    return (
      <button
        type="button"
        className={classes.add}
        aria-label={`Add status to ${label}`}
        disabled={disabled}
        onClick={onOpen}
      >
        <IconPlus size={14} aria-hidden />
        Add status
      </button>
    );
  }
  return (
    <div className={classes.row}>
      <span className={classes.dot} data-category={category} aria-hidden />
      <TextInput
        className={classes.edit}
        aria-label={`Name of the new ${label} status`}
        placeholder="In review"
        size="sm"
        value={name}
        maxLength={30}
        error={error}
        autoFocus
        onChange={(event) => {
          setName(event.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void add();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <span className={classes.editActions}>
        <Button
          size="compact-sm"
          radius="xl"
          loading={saving}
          disabled={name.trim() === ""}
          onClick={() => void add()}
        >
          Add
        </Button>
        <Button size="compact-sm" variant="subtle" color="gray" onClick={onClose}>
          Cancel
        </Button>
      </span>
    </div>
  );
}

/** A category's card: its head, its rows and "+ Add status". It is also where a dragged row can be dropped. */
function CategoryCard({
  category,
  statuses,
  counts,
  over,
  children,
}: {
  category: (typeof CATEGORIES)[number];
  statuses: ProjectStatus[];
  counts: Record<string, number> | undefined;
  over: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: containerId(category.value) });
  const total = statuses.reduce((sum, status) => sum + (counts?.[status.id] ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      className={`nimbus-panel ${classes.card}`}
      data-over={over || undefined}
      aria-label={category.label}
    >
      <div className={classes.cardHead}>
        <span className={classes.cardTitle}>
          <span className={classes.dot} data-category={category.value} aria-hidden />
          {category.label}
        </span>
        <span className={classes.cardCount}>· {issuesLabel(total)}</span>
        <span className={classes.cardBlurb}>{category.blurb}</span>
      </div>
      <div className={classes.rows}>{children}</div>
    </section>
  );
}

/**
 * A project's Statuses settings: a card for each category, its Statuses as plain rows. A name is renamed in place, a
 * Status is dragged to reorder it or into another card to change its category, and its ⋯ menu renames it, changes its
 * category, makes it the default for new Issues or deletes it after choosing where its Issues go. Everything saves as
 * it is done; the server keeps one Status in each category and refuses changes in an Archived project, and its
 * refusals are shown.
 */
export default function StatusesPage() {
  const { key = "" } = useParams();
  const projectQuery = useProject(key);
  const project = projectQuery.data;
  const statusesQuery = useProjectStatuses(project?.key);
  const counts = useIssueCounts(project?.key ?? "", {}, project !== undefined);
  const permissions = useIssuePermissions(project?.key);
  const statuses = statusesQuery.data ?? [];
  const client = useQueryClient();
  const statusesChanged = useStatusesChanged();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<ProjectStatus | null>(null);
  // While a row is carried: the groups as they would be if it were dropped now, and the card it is over.
  const [draft, setDraft] = useState<Groups | null>(null);
  const [carried, setCarried] = useState<string | null>(null);
  const [overCard, setOverCard] = useState<Category | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Changes to the order go to the server one at a time, each built on the one before.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const savesPending = useRef(0);
  const failure = loadFailure(statusesQuery) ?? loadFailure(projectQuery);
  const archived = project?.archived ?? false;
  const groups = draft ?? groupsOf(statuses);
  const carriedStatus = statuses.find((status) => status.id === carried) ?? null;

  // An unknown project, or one the User isn't a Member of, is ProjectLayout's Project not found.
  if (permissions.loaded && !permissions.canManageStatuses) {
    return (
      <StatusPage
        eyebrow="Error 403"
        title="You can't manage Statuses."
        body="Only a project admin can add, rename, reorder or remove this project's Statuses."
        code="403"
        name="Forbidden"
        actions={
          <PrimaryAction to={`/projects/${encodeURIComponent(key)}`}>
            Back to the project
          </PrimaryAction>
        }
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

  /** Adds a Status to a category; the refusal to show under the field, or null when it was added. */
  async function add(category: Category, name: string): Promise<string | null> {
    if (!project) return "Couldn't add the Status.";
    try {
      await api.addStatus(project.key, { name, category });
      statusesChanged(project.key);
      return null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors.name) {
        return error.fieldErrors.name;
      }
      if (error instanceof ApiError && error.code === "status_name_taken") return error.message;
      toast.error(failureMessage(error, "Couldn't add the Status."));
      return "Couldn't add the Status.";
    }
  }

  async function rename(status: ProjectStatus, name: string): Promise<string | null> {
    if (!project) return "Couldn't rename the Status.";
    try {
      await api.editStatus(project.key, status.id, { name });
      statusesChanged(project.key);
      return null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors.name) {
        return error.fieldErrors.name;
      }
      if (error instanceof ApiError && error.code === "status_name_taken") return error.message;
      toast.error(failureMessage(error, "Couldn't rename the Status."));
      return "Couldn't rename the Status.";
    }
  }

  async function changeCategory(status: ProjectStatus, category: Category) {
    if (!project) return;
    try {
      await api.editStatus(project.key, status.id, { category });
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't change the category."));
    }
    statusesChanged(project.key);
  }

  async function makeDefault(status: ProjectStatus) {
    if (!project) return;
    try {
      await api.makeDefaultStatus(project.key, status.id);
      toast.success(`${status.name} is now the default.`);
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't change the default."));
    }
    statusesChanged(project.key);
  }

  function start(event: DragStartEvent) {
    setCarried(String(event.active.id));
    setDraft(
      groupsOf(
        client.getQueryData<ProjectStatus[]>(queryKeys.projectStatuses(project?.key ?? "")) ??
          statuses,
      ),
    );
  }

  // Over another card, the row joins it at once, so the rows there slide apart and a dashed gap shows where it lands.
  function over(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : null;
    const activeId = String(event.active.id);
    setDraft((now) => {
      const base = now ?? groupsOf(statuses);
      if (overId === null || overId === activeId) return base;
      const from = categoryOf(base, activeId);
      const to = categoryOf(base, overId);
      return from && to && from !== to ? dropped(base, activeId, overId) : base;
    });
    setOverCard(draft && overId ? (categoryOf(draft, overId) ?? null) : null);
  }

  /**
   * A drop, done the way the Board's is: the new order goes into the cache in the same tick the drag lets go, so no
   * render shows the row back in the card it came from, and a refresh already on its way is cancelled without
   * waiting (and without calling that a failed refresh). The saving then follows, one change at a time.
   */
  function finish(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const base = draft ?? groupsOf(statuses);
    const letGo = () => {
      setCarried(null);
      setDraft(null);
      setOverCard(null);
    };
    if (!project || !event.over) return letGo();
    const key = queryKeys.projectStatuses(project.key);
    // The newest list, which already has any drop still being saved.
    const current = client.getQueryData<ProjectStatus[]>(key) ?? statuses;
    const before = groupsOf(current);
    const after = dropped(base, activeId, String(event.over.id));
    const ids = CATEGORIES.flatMap((category) => after[category.value].map((status) => status.id));
    const was = CATEGORIES.flatMap((category) => before[category.value].map((status) => status.id));
    const category = categoryOf(after, activeId);
    const changedCategory = category !== undefined && category !== categoryOf(before, activeId);
    if (!changedCategory && ids.join() === was.join()) return letGo();

    const byId = new Map(
      CATEGORIES.flatMap((card) => after[card.value]).map((status) => [status.id, status]),
    );
    const reordered = ids.flatMap((id, position) => {
      const status = byId.get(id);
      return status ? [{ ...status, position }] : [];
    });
    void client.cancelQueries({ queryKey: key }, { revert: false, silent: true });
    client.setQueryData(key, reordered);
    letGo();
    save(key, current, ids, changedCategory ? { id: activeId, category } : null);
  }

  /** Sends a drop to the server after the ones before it; `previous` is what the list was before this drop. */
  function save(
    key: ReturnType<typeof queryKeys.projectStatuses>,
    previous: ProjectStatus[],
    ids: string[],
    recategorised: { id: string; category: Category } | null,
  ) {
    if (!project) return;
    savesPending.current += 1;
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        if (recategorised) {
          await api.editStatus(project.key, recategorised.id, { category: recategorised.category });
        }
        await api.reorderStatuses(project.key, ids);
      } catch (error) {
        toast.error(failureMessage(error, "Couldn't save the change."));
        // Alone, put the list back as it was at once; with others still to be sent it would undo theirs too.
        if (savesPending.current === 1) client.setQueryData(key, previous);
      }
      savesPending.current -= 1;
      // Only the last one refreshes, so an earlier answer can't undo a later drop.
      if (savesPending.current === 0) statusesChanged(project.key);
    });
  }

  function cancel() {
    setCarried(null);
    setDraft(null);
    setOverCard(null);
  }

  const total = statuses.length;
  const full = total >= MAX_STATUSES;
  const countsByStatus = counts.data?.statuses;
  const onlyOne = (status: ProjectStatus) => groups[status.category].length === 1;

  // The Settings tab, under the project's header and tabs (ProjectLayout), which hold the breadcrumb.
  return (
    <>
      <Stack gap="lg" maw={720} className={classes.page}>
        <div>
          <Title order={2} fz={28}>
            Statuses
          </Title>
          <Text c="dimmed" size="sm" mt={4}>
            The columns issues move through, grouped by category. Drag to reorder or to move a
            status to another category. Each category keeps at least one status.
          </Text>
        </div>
        {!project || statusesQuery.isPending ? (
          <Loading>
            <PillListSkeleton />
          </Loading>
        ) : (
          <>
            {refreshFailed(statusesQuery) && (
              <StaleNotice
                title="Couldn't refresh the Statuses"
                shown="the last loaded Statuses"
                onRetry={() => void statusesQuery.refetch()}
              />
            )}
            {archived && (
              <Alert color="gray" title="This project is archived">
                Its Statuses can't be changed.
              </Alert>
            )}
            {statuses.length === 0 ? (
              <Text c="dimmed" size="sm">
                This project has no Statuses yet. To do, In progress and Done are made with its
                first Issue, or when you add a Status.
              </Text>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={start}
                onDragOver={over}
                onDragEnd={finish}
                onDragCancel={cancel}
              >
                <Stack gap="md">
                  {CATEGORIES.map((category) => (
                    <CategoryCard
                      key={category.value}
                      category={category}
                      statuses={groups[category.value]}
                      counts={countsByStatus}
                      over={
                        overCard === category.value &&
                        carriedStatus !== null &&
                        carriedStatus.category !== category.value
                      }
                    >
                      <SortableContext
                        items={groups[category.value].map((status) => status.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {groups[category.value].map((status) => (
                          <StatusRow
                            key={status.id}
                            status={status}
                            count={countsByStatus?.[status.id] ?? 0}
                            readOnly={archived}
                            onlyOneInCategory={onlyOne(status)}
                            renaming={renaming === status.id}
                            onStartRename={() => setRenaming(status.id)}
                            onStopRename={() => setRenaming(null)}
                            onRename={rename}
                            onCategory={(row, next) => void changeCategory(row, next)}
                            onDefault={(row) => void makeDefault(row)}
                            onDelete={setDeleting}
                          />
                        ))}
                      </SortableContext>
                      {!archived && (
                        <AddStatus
                          category={category.value}
                          label={category.label}
                          disabled={full}
                          adding={addingTo === category.value}
                          onOpen={() => setAddingTo(category.value)}
                          onClose={() => setAddingTo(null)}
                          onAdd={add}
                        />
                      )}
                    </CategoryCard>
                  ))}
                </Stack>
                <DragOverlay>
                  {carriedStatus && (
                    <div className={`${classes.row} ${classes.lifted}`}>
                      <RowBody
                        status={carriedStatus}
                        count={countsByStatus?.[carriedStatus.id] ?? 0}
                        handle={
                          <span className={classes.handle} style={{ opacity: 1 }} aria-hidden>
                            <IconGripVertical size={18} />
                          </span>
                        }
                      />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
            {full && (
              <Text size="sm" c="dimmed">
                A project has at most {MAX_STATUSES} Statuses.
              </Text>
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
    </>
  );
}
