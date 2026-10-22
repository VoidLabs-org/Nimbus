# projects

Owns **Projects** and their **Members**. This first slice implements creating a project and opening it; listing, editing, archiving and Member management are not implemented yet. Feature spec #36, ticket #38. Terms are in [GLOSSARY.md](../../GLOSSARY.md).

## Public interface

`Projects` offers `findById(UUID)`, `findByKey(String)` (case-insensitive), and `isMember(projectId, userId)`. Lookups return an optional `ProjectSummary(id, key, name, archived)`; an unknown project gives an empty result, and missing membership gives false. These are internal application lookups, not authorization checks. A consuming module must authorize its caller and check `archived` before writing into a project. Everything under `projects.internal` is private.

## Events published

`ProjectCreated(projectId, key, creatingUserId)` is published once in the transaction that inserts the project and its first Member. The key is uppercase. Reads, rejected input and conflicting creates publish nothing. Consumers should handle it after commit. `access` does not listen to it: later RBAC integration calls `access` from `projects`, as required by [ADR 0002](../adr/0002-per-project-roles-and-access-as-a-foundation.md).

## Rules

- The existing identity gate requires a signed-in User with a verified email. An Unverified User gets `403` with `code: email_unverified` before a project endpoint runs.
- Any verified User can create a project and becomes its first Member in the same transaction. Only Members can open it. Unknown and non-Member projects both give `404 Project not found`.
- `ProjectService.requireCanChange(actor, projectId)` is the single internal change decision for subsequent tickets: any Member may change the project for now. Future RBAC integration replaces this decision. Permission declarations already exist, but this slice does not enforce scoped Grants or give project Roles.
- Project key: 2–10 ASCII letters/digits, starting with a letter, accepted in either case and stored uppercase. Whitespace is not accepted. Keys are unique across all projects, including Archived projects, and have no change or deletion operation. The database constraint also resolves concurrent creation attempts: one succeeds, the others get `409` without acquiring membership.
- Name: surrounding whitespace is stripped; 1–100 Unicode code points, no ISO control characters. Names need not be unique.
- Description: nullable plain text, at most 1000 Unicode code points, preserved as entered. Line breaks and tabs are allowed; other control characters are a field error. Omitted and null descriptions remain null.
- Fields are checked with Bean Validation on the request (`400` with `errors` keyed by field, the same shape as `access` and `identity`). The name is cleaned at both ends before it is checked: whitespace (a pasted trailing newline too), Unicode spaces such as a non-breaking space, and invisible format characters such as a zero-width space. A name of only those is empty and rejected. Created and read times are in microseconds, as the database keeps them, so the time in the `201` is the one a later read returns.
- Creation and membership timestamps are stored together. New projects are not archived; the archived state is exposed now for future consumers.

## REST endpoints

Contract: [openapi.yaml](openapi.yaml).

| Endpoint                  | Behavior                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/projects`      | `{key, name, description?}` → `201` with the project. `400` with `errors` keyed by field for invalid input; `409` with `errors.key` for a taken key.                         |
| `GET /api/projects/{key}` | The project for a Member, matched case-insensitively: `200`; otherwise `404`. A key that is not 2–10 ASCII letters or digits matches nothing (so `ſam` does not open `SAM`). |

Both return `{id, key, name, description, archived, createdAt}`. `createdAt` is an ISO timestamp. Missing or invalid access tokens get `401`; unverified email gets the identity gate's `403`.

## Tables

Migration `V14__projects.sql` adds the tables below. It was numbered while `V15` was already on `main`, so the API runs Flyway with `spring.flyway.out-of-order=true`: a database that has applied `V15` but not `V14` applies `V14` on its next start instead of refusing to boot.

| Table             | Columns and constraints                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`        | `id` UUID primary key, `key` unique and uppercase ASCII format checked, `name`, nullable `description`, nullable `archived_at`, `created_at`. |
| `project_members` | `project_id` → `projects`, `user_id` → `users`, `added_at`; primary key `(project_id, user_id)` and index on `user_id`. No Role data.         |

## Web app

The shared navbar has a **Projects** link in horizontal, vertical and narrow layouts, active throughout `/projects`. `/projects` currently contains the **New project** form; the project list comes in #39. A key is suggested from the name (word initials, or the first three characters for one word), up to ten characters; no key is suggested when it would be shorter than two. The key follows the name while it is empty or still the suggestion, and stays as typed once the User changes it. A create that finishes after the User has left the page does not navigate. Invalid or taken keys and other field errors appear on their fields. Success opens `/projects/:key` and shows a toast.

The project page shows its name, key and plain-text description, with a fallback when none is set. Unknown and non-Member keys show the same **Project not found** screen. The pages reuse the app shell, breadcrumbs, Panel, skeletons, toasts and error screens in all four themes. Data uses the session-scoped TanStack Query cache (`queryKeys.project(key)`; `useProjectCreated` stores the created project, so opening it shows it at once and then refreshes it); a first load shows a delayed skeleton, a returning visit shows cached details and refetches, and a failed refresh is visible with a retry action. There are no editing controls in this slice.

## Verification

HTTP tests register and verify Users through identity's endpoints and exercise creation, validation, membership isolation and conflicts against disposable PostgreSQL. A Spring Modulith module test checks the event and public lookups. The API client is tested through its fetch boundary; UI verification uses the running app. All tests avoid the shared development database.
