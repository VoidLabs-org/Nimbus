import {
  IconCategory,
  IconChartBar,
  IconCircleHalf2,
  IconHexagon,
  IconLayoutKanban,
  IconLayoutRows,
  IconList,
  IconTable,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { Issue, IssueCounts, IssueSearch, ProjectStatus } from "../api/client";
import { PriorityMark, StatusDot, TypeBadge } from "./IssueMarks";

/** The fields of the Filter menu, in its order; each takes one value for now. */
export const FILTER_FIELDS = ["status", "category", "type", "priority"] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const FIELD_LABELS: Record<FilterField, string> = {
  status: "Status",
  category: "Category",
  type: "Type",
  priority: "Priority",
};

export const FIELD_ICONS: Record<FilterField, ReactNode> = {
  status: <IconCircleHalf2 size={16} aria-hidden />,
  category: <IconCategory size={16} aria-hidden />,
  type: <IconHexagon size={16} aria-hidden />,
  priority: <IconChartBar size={16} aria-hidden />,
};

export const CATEGORIES: { value: Issue["status"]["category"]; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];
export const TYPES: Issue["type"][] = ["Story", "Bug", "Chore"];
export const PRIORITIES: Issue["priority"][] = ["Urgent", "High", "Medium", "Low"];

/** One value of a field: what goes in the address, what it is called, its mark and how many Issues it would show. */
export type FilterOption = { value: string; label: string; mark: ReactNode; count: number };

/** A field's values, with their counts (each field's counts leave out its own filter, as the server gives them). */
export function optionsFor(
  field: FilterField,
  statuses: ProjectStatus[],
  counts: IssueCounts | undefined,
): FilterOption[] {
  switch (field) {
    case "status":
      return statuses.map((status) => ({
        value: status.name,
        label: status.name,
        mark: <StatusDot category={status.category} />,
        count: counts?.statuses[status.id] ?? 0,
      }));
    case "category":
      return CATEGORIES.map((category) => ({
        value: category.value,
        label: category.label,
        mark: <StatusDot category={category.value} />,
        count: counts?.categories[category.value] ?? 0,
      }));
    case "type":
      return TYPES.map((type) => ({
        value: type,
        label: type,
        mark: <TypeBadge type={type} />,
        count: counts?.types[type] ?? 0,
      }));
    case "priority":
      return PRIORITIES.map((priority) => ({
        value: priority,
        label: priority,
        mark: <PriorityMark priority={priority} />,
        count: counts?.priorities[priority] ?? 0,
      }));
  }
}

/** The fields of the menu that have a value, in the menu's order. */
export function appliedFields(search: IssueSearch): FilterField[] {
  return FILTER_FIELDS.filter((field) => search[field] !== undefined);
}

/** A chosen value as it reads, such as "In progress" for the category IN_PROGRESS. */
export function valueLabel(field: FilterField, value: string): string {
  return field === "category"
    ? (CATEGORIES.find((category) => category.value === value)?.label ?? value)
    : value;
}

/** "1 issue", "12 issues". */
export function issueCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "issue" : "issues"}`;
}

/** The Issues tab's views, in the switcher's order. */
export const VIEWS = [
  { value: "list", label: "List", icon: IconList },
  { value: "board", label: "Board", icon: IconLayoutKanban },
  { value: "table", label: "Table", icon: IconTable },
  { value: "swimlanes", label: "Swimlanes", icon: IconLayoutRows },
] as const;
export type View = (typeof VIEWS)[number]["value"];
