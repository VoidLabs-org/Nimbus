# issues

Owns **Issues**, their **Statuses** and (later) their history views. So far it implements creating an Issue, opening it by key and finding a project's Issues; editing, moving, assigning, deleting, Status management and permissions are not implemented yet. Feature spec #51, tickets #53 and #54. Terms are in [GLOSSARY.md](../../GLOSSARY.md).

## Public interface

Nothing but the event below yet. Everything under `issues.internal` is private. The module uses only the public APIs of `projects` (`findByKey`, `isMember`, and the `archived` flag of `ProjectSummary`) and `identity` (`Users.findAllById`, for the Reporter's and Assignee's names and pictures).

## Events published

`IssueCreated(projectId, issueKey)` is published once, in the transaction that inserts the Issue. The key is uppercase, like `NIM-12`. Reads and refused creates (validation, not a Member, Archived project) publish nothing. Consumers should handle it after commit.

## Rules

- **Interim check.** `IssueAccess.require(actor, projectId, action)` is the single decision for every action: it allows any Member and gives "not found" to everyone else. The permission integration (#48) replaces its body with `access`'s check and declares the Permissions in the catalog, without touching callers.
- **Issue key.** The Project key (uppercase), a dash and the number: `NIM-12`. It matches in any case on lookup. Only ASCII letters and digits are accepted, and a number is 1 to 9 digits with no leading zero; anything else matches nothing, so it is "not found", not an error.
- **Numbers** count up per project from 1. `issue_counters` holds the last number used per project; creating an Issue increments it with a single `UPDATE ... RETURNING`, which locks the row until the transaction ends, so concurrent creates queue up and get distinct numbers. Numbers only go up, so one is never given again, and a create that fails after taking a number rolls the increment back with everything else.
- **Statuses.** Each project has its own ordered Statuses (`issue_statuses`). Nothing listens to `ProjectCreated`: the first create in a project that has none makes To do (category `TODO`), In progress (`IN_PROGRESS`) and Done (`DONE`), in that order, while holding the counter row's lock, so they are made once even under concurrent requests, and projects that existed before Issues do the same. A new Issue starts in the first Status, in order, whose category is `TODO`.
- **Fields.** Type is `Story`, `Bug` or `Chore`. Title: surrounding whitespace removed, then 1 to 255 characters, no control characters. Description: optional Markdown of at most 50,000 characters, stored as typed (the web app sanitises it when rendering). Priority is `Urgent`, `High`, `Medium` or `Low`, `Medium` when omitted. Invalid fields give `400` with `errors` keyed by field, like `projects`.
- **Reporter** is the creating User and never changes. **Assignee** is optional and must be a Member of the project: otherwise `400` with `errors.assigneeId`.
- **Archived projects** refuse new Issues with `409`; reading still works. `issues` asks `projects` before each write.
- **History.** Creating writes a `created` entry (actor = the Reporter, no before or after).
- Unknown projects, unknown Issues and projects the User is not a Member of all give `404`. Missing or invalid access tokens give `401`; an unverified email gets the identity gate's `403`.

## REST endpoints

Contract: [openapi.yaml](openapi.yaml).

| Endpoint                          | Behavior                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/projects/{key}/issues` | `{type, title, description?, priority?, assigneeId?}` → `201` with the Issue. `400` field errors, `404`, `409` (Archived).                                                 |
| `GET /api/projects/{key}/issues`  | One page of the project's Issues, filtered and sorted (below): `200` with `{items, total, page, size}`. `400` for invalid parameters (`errors` keyed by parameter), `404`. |
| `GET /api/issues/{issueKey}`      | The Issue for a Member, with the key in any case: `200`; otherwise `404`.                                                                                                  |

**Finding Issues.** Parameters, all optional, combine with AND; an empty result is a normal `200` with `total` 0.

- `status`: a Status name, ignoring case. `category`: `TODO`, `IN_PROGRESS` or `DONE`. `type` and `priority`: as on create.
- `assignee`: a User id, `me` (the caller) or `none` (unassigned).
- `q`: split on whitespace; every word must appear in the title, in any case. `%`, `_` and `\` in a word are plain text. At most 10 words and 200 characters, otherwise `400`.
- `sort`: `updated` (default, most recently updated first), `created` (newest first) or `priority` (Urgent first, then most recently updated). Ties end with the highest number first, so paging never repeats or skips an Issue.
- `page` (from 0, default 0) and `size` (1 to 100, default 50). A page beyond the last is empty. `total` counts the matches across all pages.

An Issue is `{id, key, number, type, title, description, priority, status: {id, name, category}, reporter: {id, displayName, avatarUrl}, assignee: {…} | null, createdAt, updatedAt, version}`. `version` starts at 0. Times are in microseconds, as the database keeps them.

## Tables

Migration `V25__issues.sql`.

| Table            | Columns and constraints                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue_statuses` | `id`, `project_id` → `projects`, `name` (unique per project ignoring case), `category` (`TODO`, `IN_PROGRESS`, `DONE`), `position`.                                                      |
| `issue_counters` | `project_id` primary key → `projects`, `last_number`.                                                                                                                                    |
| `issues`         | `id`, `project_id`, `number` (unique with project), `type`, `title`, `description`, `priority`, `status_id` → `issue_statuses`, `reporter_id`, nullable `assignee_id`, times, `version`. |
| `issue_history`  | `id`, `issue_id` → `issues` (deleted with it), nullable `actor_id` (null is the system), `at`, `field`, nullable `before_value` and `after_value`. Never edited.                         |

## Web app

The project page has a **Create Issue** button (hidden for an Archived project) that opens a form above the project details: Issue type, Title, Markdown Description, Priority and Assignee. Until the project's Members can be listed, the Assignee choices are Unassigned and the User themself. Field errors appear on their fields; success shows a toast and opens `/issues/:issueKey`. A create that finishes after the User has left the page shows a toast and does not navigate.

`/projects/:key/issues` lists the project's Issues: quick filters (Everyone, Assigned to me, Unassigned), a title search (applied once typing pauses), Status category, Issue type and Priority selects, a sort choice, paging at 50 a page and **Create Issue** (hidden for an Archived project). The filters live in the address, so a filtered list can be shared and survives a reload; values it does not recognise are ignored. Each row shows the title, key, type, priority, Status and Assignee, and opens `/issues/:issueKey`. The project page links to it with **View Issues**. There is no Status filter in the web app until the project's Statuses can be listed; the API takes `status` already.

`/issues/:issueKey` shows the key, type, title, description, Status (with its category), priority, Reporter and Assignee, read-only. The description is rendered with `react-markdown` and `remark-gfm` (checklists, tables): raw HTML is never rendered (a pasted `<script>` shows as text) and unsafe link addresses such as `javascript:` are dropped. Unknown keys, and Issues of projects the User is not in, show "Issue not found."

## Verification

`CreateIssueTests` (HTTP, against disposable PostgreSQL) covers creating, defaults, numbering per project, concurrent creates (distinct numbers, one shared To do Status), lazy Statuses, validation, Assignee rules, `404` for non-Members and unknown keys, `401`, the Archived refusal and the `created` history entry. As there are no Status or history endpoints yet, the last two checks read the tables directly. `FindIssuesTests` covers each filter and their combinations, title words (including wildcard characters), each sort, paging with the total, invalid parameters, `404` and `401`; as there are no endpoints to move or edit an Issue, it sets Statuses and update times in the tables. `IssueCreatedEventTests` is a Spring Modulith module test of the event. `IssuesPage.test.tsx` checks the list, filters read from and sent to the API, paging and Create Issue. `IssuePage.test.tsx` checks the page, the Markdown rendering and the not-found screen. `ModularityTests` checks the module boundaries.
