# access

Owns **Permissions**, **Roles**, **Grants**, **Scopes** and **Role assignments**: who may do what, where. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). Every other module depends on `access`, and `access` depends only on `identity`'s public API; it stores User and project ids but never knows other modules ([ADR 0002](../adr/0002-per-project-roles-and-access-as-a-foundation.md)). Feature spec: #42.

## Public interface

| Type                           | Use                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModulePermissions`            | Implement it as a bean in your module to declare its Permissions. Collected into the catalog at startup.                                                                                                                                                                                                       |
| `Permission`                   | One declaration: `Permission.platform(key, heading, description)` or `Permission.project(key, heading, description, scopes...)`, then `.ownHint(...)`, `.grantedTo(builtInRole[, scope])` for its defaults in the built-in Roles, and `.lockedIn(builtInRole, scope)` for a default the Role must always keep. |
| `BuiltInRole`, `Kind`, `Scope` | The built-in Roles, platform or project, and `OWN` / `PROJECT` / `ALL`.                                                                                                                                                                                                                                        |
| `PlatformPermissions`          | `holds(userId, key)` and `require(userId, key)`: whether a User holds a platform permission, through Everyone or their platform roles. `false` for keys that aren't platform permissions in the catalog.                                                                                                       |
| `@Authorize("key")`            | On a controller method or class: requires the signed-in User to hold that platform permission, `403` otherwise. Only for platform permissions; project permissions need the project, so services ask `ProjectScopes` explicitly.                                                                               |
| `ProjectScopes`                | `scope(userId, projectId, key)`: the widest Scope the User has for a project permission in a project, or empty; `require(...)` returns it or throws `PermissionDeniedException`; `filter(userId, key)`: a `ProjectFilter` for lists. See [Project checks](#project-checks).                                    |
| `ProjectFilter`                | `allProjects` (Scope `ALL`), `everythingIn` (projects with `PROJECT`), `ownIn` (projects with `OWN`), and `scopeIn(projectId)`.                                                                                                                                                                                |
| `ProjectRoles`                 | `give`, `change` and `remove` a User's project role in a project, and `roleOf(projectId, userId)`. Called by the module that owns Members, in the same transaction as the Member change.                                                                                                                       |
| `NotAProjectRoleException`     | Thrown by `give` and `change` when the key is not a project role (unknown, or a platform role).                                                                                                                                                                                                                |
| `PermissionDeniedException`    | Thrown by `require`; answered with `403` problem details from any module.                                                                                                                                                                                                                                      |

Everything under `access.internal` is private to the module.

## Events published

None yet.

## Events consumed

| Event                         | Reaction                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserRegistered` (`identity`) | If it is the `NIMBUS_ADMIN_EMAIL` User and their email is verified, give them Platform admin. Runs synchronously right after the registration commits (`@TransactionalEventListener` in a new transaction), so the admin holds it by the time the registration or admin seed returns. |
| `EmailVerified` (`identity`)  | The same check, when someone proves an email they had only registered with a password (by signing in with Google or GitHub). The real owner of the admin email becomes Platform admin at once, without a restart.                                                                     |

## Permissions

A key is `module:resource:action`, lowercase, starting with the declaring module's name. A **platform permission** is granted in platform roles without a Scope. A **project permission** is granted in project roles with one of its allowed Scopes (`OWN` and/or `PROJECT`, never `ALL`), and in platform roles only with `ALL`. A project permission with no allowed Scopes can only be held by platform roles. A declaration that breaks a rule (key format, module prefix, a key declared twice, a default Scope it doesn't allow, a default in the wrong kind of Role, Platform admin as a default, an own hint without `OWN`) stops startup with a message naming the key.

| Key                        | Kind     | Allowed Scopes | Defaults               | Declared by |
| -------------------------- | -------- | -------------- | ---------------------- | ----------- |
| `access:role:manage`       | platform |                | Platform admin only    | `access`    |
| `access:role:assign`       | platform |                | Platform admin only    | `access`    |
| `access:audit:view`        | platform |                | Platform admin         | `access`    |
| `projects:project:create`  | platform |                | Everyone               | `projects`  |
| `projects:project:view`    | project  | none           | Platform admin (`ALL`) | `projects`  |
| `projects:project:update`  | project  | `PROJECT`      | Project admin          | `projects`  |
| `projects:project:archive` | project  | `PROJECT`      | Project admin          | `projects`  |
| `projects:member:manage`   | project  | `PROJECT`      | Project admin (locked) | `projects`  |

`access:role:manage` and `access:role:assign` are reserved to Platform admin: no other Role may hold them, so nobody can give themselves or others the power to change access.

## Roles

| Role           | Key              | Kind     | Holds                                                                                        |
| -------------- | ---------------- | -------- | -------------------------------------------------------------------------------------------- |
| Platform admin | `platform_admin` | platform | Every Permission, project ones with `ALL`, including Permissions added later. Locked.        |
| Everyone       | `everyone`       | platform | Every signed-in User holds it without being assigned; it is never listed with holders.       |
| Project admin  | `project_admin`  | project  | Every project permission with `PROJECT`.                                                     |
| Developer      | `developer`      | project  | No `projects` Permissions by default; later modules add theirs (e.g. editing Issues).        |
| Viewer         | `viewer`         | project  | No `projects` Permissions by default. Members see their own projects without any Permission. |

## Project checks

A User's Scope for a project permission in a project is the widest (`ALL` > `PROJECT` > `OWN`) among the Grants for it in their project role in that project, their platform roles and Everyone. A Grant counts only with a Scope that fits it now: `ALL` in a platform role, one of the Permission's allowed Scopes in a project role; Grants for keys no longer in the catalog allow nothing. Asking about a key that is not a project permission in the catalog throws `IllegalArgumentException`, so a typo fails loudly instead of refusing everyone. A null User or project id throws `NullPointerException` for the same reason (a missing project id would otherwise quietly ignore the project role). The Roles page refuses the same Grants the checks ignore: both use one rule.

`access` never looks at records. With `OWN` the calling module decides which records are the User's own, applies it, and documents it in its module spec. For lists, `filter` gives `allProjects` (the User has `ALL`; both sets are then empty), `everythingIn` (projects where they have `PROJECT`) and `ownIn` (projects where they have `OWN`); a project is in at most one set. Seeing a project at all is `projects`' rule (Members, or `projects:project:view` with `ALL`), not part of this filter.

Answers are remembered until the end of the current request, so a request that asks several times reads the database once; there is no cache across requests. Every change to Grants or Role assignments clears what the request remembered, so it sees its own changes, and clears it again when the transaction ends, so nothing read inside a rolled-back transaction outlives it. Outside a request (startup, listeners) nothing is remembered.

**Project roles:** a User holds at most one project role per project (a unique index guards it). `give` refuses a second one and `change` / `remove` refuse when there is none (`IllegalStateException`: the caller's Members and the assignments disagree). Only project roles are accepted (`NotAProjectRoleException`). The methods join the caller's transaction; a refused change has written nothing, so these exceptions don't mark that transaction rollback-only and the caller may catch them and carry on. `access` stores the User and project ids without checking that they exist; removing the assignment when a Member leaves is the caller's job. Each method takes the acting User (`null` for the system); the audit log records project role changes from #50.

## Editing Roles

The Platform admin edits Roles on the Roles page (all of it needs `access:role:manage`):

- **Create** a custom Role with a key (2 to 50 lowercase letters, digits and underscores, starting with a letter; unique, `409` if taken), a name (1 to 100 characters, trimmed), an optional description (at most 500) and a kind (`platform` or `project`). It starts with no Grants. Key and kind never change: a request that tries gets `400`.
- **Rename and describe** any Role but Platform admin.
- **Save Grants**: the whole set at once, replacing the old one. Each Grant must fit: a known Permission; in a project role, a project permission with one of its allowed Scopes; in a platform role, a platform permission without a Scope or a project permission with `ALL`; not a reserved Permission (unless Platform admin); not listed twice. Otherwise `400` with what is wrong per Permission under `errors`. Removing a locked Grant (Project admin's `projects:member:manage`) is `409`.
- **Versions**: every Role has a version that changes on each edit. Renaming, saving Grants and resetting send the version they started from; a different one is refused with `409` ("This Role changed since you opened it"), so nobody overwrites someone else's change.
- **Platform admin is locked**: it can't be renamed, reset or have its Grants changed (`409`).
- **Customised**: renaming or saving Grants of a built-in Role marks it customised (with the time). **Reset to defaults** (built-in Roles only) restores its name, description and Grants and clears the mark.
- **New Permissions**: a customised built-in Role reports `newPermissions`: its code defaults it doesn't hold that first appeared after its Grants were last saved (or, if only renamed, after it was customised). Saving the Grants means the admin saw every Permission there was, so defaults they left out stop being reported.
- **Delete** a custom Role only while nobody holds it (`409` with the number of assignments otherwise). Built-in Roles can't be deleted (`409`).

## Platform role holders

The Platform admin gives platform roles to Users and takes them away on a Role's People tab (all of it needs `access:role:assign`, which only Platform admin holds):

- **Give** a platform role to an existing User found by exact email (any case, surrounding whitespace ignored): `404` if no User has it, `409` if they already hold it. A User may hold several platform roles.
- **Take** it away: `404` if they don't hold it.
- **Everyone** has no holders to list, give or take (`409`): every signed-in User holds it. **Project roles** are given on a project's Members page, not here (`409`).
- **Nobody changes their own Role assignments** (`403`), so nobody promotes themselves or locks themselves out by mistake.
- **Nimbus always has a Platform admin:** taking it from its last holder is refused (`409`). Every give and take locks the Role's row for its transaction and counts the holders inside it, so two admins removing each other at the same time can't both succeed. Since only Platform admin may assign Roles and nobody changes their own, this race is the only way it could happen.
- Changes take effect on the next request: there is no cache across requests.

## Audit log

Every change to Roles is recorded in the same transaction as the change, so a refused or failed change leaves no entry and a saved one always has one:

| Action                           | When                                                                                                                                   | `before` / `after`                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `role.created`                   | A custom Role is created by an admin, or a built-in Role by the system on first startup                                                | none / `{name, description, kind}`                |
| `role.renamed`                   | A Role's name is changed (with or without its description)                                                                             | `{name, description}` / the same                  |
| `role.described`                 | Only a Role's description is changed. A save that changes neither writes nothing and keeps the version                                 | `{name, description}` / the same                  |
| `role.grants_changed`            | A Role's Grants are saved                                                                                                              | `{grants}` / `{grants}` (Permission key to Scope) |
| `role.reset`                     | A built-in Role is reset to its defaults                                                                                               | `{name, description, kind, grants}` / the same    |
| `role.defaults_applied`          | Startup brings a built-in Role that isn't customised back to the code defaults (by the system)                                         | `{grants}` / `{grants}`                           |
| `role.locked_grants_restored`    | Startup gives a customised built-in Role back a Grant it must always hold (by the system)                                              | `{grants}` / `{grants}`                           |
| `role.assigned`                  | A User is given a platform role on its People tab, or Platform admin by the system (the admin email at startup or when it is verified) | none / `{user: {id, email}}`                      |
| `role.unassigned`                | A User's platform role is taken away                                                                                                   | `{user: {id, email}}` / none                      |
| `role.deleted`                   | A custom Role is deleted                                                                                                               | `{name, description, kind, grants}` / none        |
| `catalog.unknown_grant`          | Startup finds a Grant for a key no longer in the catalog (by the system), once when it appears, not at every restart                   | none / `{permission}`                             |
| `catalog.unknown_grant_resolved` | That Grant is gone again (a migration removed it, or its Role was deleted), so the same Grant going stale later is recorded again      | none / `{permission}`                             |

Each entry has the actor (the signed-in User, or none for the system), the time, the action, the target (`role` and its key) and `before` / `after` as JSON. Entries are kept forever: a database trigger refuses any update, delete or truncation of the table. Reading the log needs `access:audit:view`, which any platform role may hold (it is not reserved), so auditors can read without being able to change access. The email in an assignment entry is the one the User had then. Project role assignments will be recorded too (#50).

## Startup

Before the API takes requests, every startup:

1. Upserts `access_permissions` from the declarations, keeping when each Permission was first seen, and removes keys no longer declared.
2. Creates any missing built-in Role, and resets every built-in Role that is not customised to the code defaults. If a custom Role already uses a built-in Role's key (a key a later release made built in), startup stops with a message to rename it with a migration, instead of overwriting it. Platform admin is always reset to every Permission. A customised built-in Role keeps what the admin set, except that its locked Grants are put back if missing.
3. Logs a warning for each Grant whose key is no longer in the catalog. Such a Grant allows nothing and is never deleted automatically: rename or remove it with a Flyway migration in the same PR as the change.
4. Gives Platform admin to the User with `NIMBUS_ADMIN_EMAIL` (`nimbus.admin.email`) if their email is verified: the seeded admin, or someone who proved the address with Google or GitHub. An unverified match (someone who registered that email with a password) gets nothing and is logged with the reason, so they can't take over Nimbus. Nothing happens when the setting is empty.

Running it again changes nothing. The sync takes a Postgres advisory lock for its transaction, so instances starting at the same time against one database wait for each other instead of colliding.

**Shared dev database:** the catalog and the uncustomised built-in Roles always follow the code of the instance that started last. Two developers on branches with different Permissions keep resetting each other's catalog and defaults on the shared dev database (a running server keeps working, but its Roles may not match its code until it restarts). Work on new or changed Permissions against a local database (`docker compose up -d`).

## REST endpoints

| Endpoint                                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/access/permissions`                   | The catalog sorted by heading and key: `{permissions: [{key, heading, description, kind, scopes, ownHint, reserved}]}`. Needs `access:role:manage`.                                                                                                                                                                                                                                                                                                                     |
| `GET /api/access/roles`                         | Every Role, platform roles first, then built-in order, then name: `{roles: [{key, name, description, kind, builtIn, customised, permissions, holders}]}`. `holders` is null for Everyone. Needs `access:role:manage`.                                                                                                                                                                                                                                                   |
| `GET /api/access/roles/{key}`                   | One Role with `version`, `locked`, `newPermissions` and `grants: [{permission, scope, locked}]` (scope null for platform permissions; Grants for unknown keys left out). `404` for an unknown key. Needs `access:role:manage`.                                                                                                                                                                                                                                          |
| `POST /api/access/roles`                        | `{key, name, description, kind}`: `201` with the new Role. `409` if the key is taken, `400` with `errors` for invalid fields.                                                                                                                                                                                                                                                                                                                                           |
| `PATCH /api/access/roles/{key}`                 | `{name?, description?, version}`: the updated Role. `409` if stale or Platform admin; `400` if `key` or `kind` is sent.                                                                                                                                                                                                                                                                                                                                                 |
| `PUT /api/access/roles/{key}/grants`            | `{grants: [{permission, scope}], version}`: replaces every Grant, returns the Role. `400` with `errors` per Permission, `409` if stale, locked or Platform admin.                                                                                                                                                                                                                                                                                                       |
| `POST /api/access/roles/{key}/reset`            | `{version}`, built-in Roles only: back to the defaults, returns the Role. `409` if stale, for Platform admin, or for a custom Role.                                                                                                                                                                                                                                                                                                                                     |
| `DELETE /api/access/roles/{key}`                | Custom Roles nobody holds: `204`. `409` for built-in Roles and Roles someone holds.                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /api/access/audit`                         | `?page=` (from 0) `&size=` (1 to 100, default 50) `&asOf=`: `{entries: [{id, at, actor: {id, displayName, email} or null, action, target: {type, key, exists}, before, after}], page, size, total, asOf}`, newest first. The first request fixes `asOf` (the newest entry); passing it back keeps later pages from shifting as new entries arrive. Invalid paging is `400`. Needs `access:audit:view`.                                                                  |
| `GET /api/access/roles/{key}/users`             | Who holds a platform role: `{users: [{id, email, displayName, avatarUrl, since}]}`, sorted by name then email. `404` for an unknown key, `409` for Everyone and project roles. Needs `access:role:assign`.                                                                                                                                                                                                                                                              |
| `POST /api/access/roles/{key}/users`            | `{email}`: `201` with the new holder. `404` if no User has the email, `409` if they already hold it (or for Everyone and project roles), `403` for your own email, `400` for a blank email. Needs `access:role:assign`.                                                                                                                                                                                                                                                 |
| `DELETE /api/access/roles/{key}/users/{userId}` | `204`. `404` if they don't hold it, `409` for the last Platform admin (or for Everyone and project roles), `403` for yourself. Needs `access:role:assign`.                                                                                                                                                                                                                                                                                                              |
| `GET /api/access/me/permissions`                | The signed-in User's platform permissions: `{platform: [...]}`, sorted. With `?project={projectId}`, also `project: {key: scope}`: each project permission they have in that project with its widest Scope (permissions they lack are left out). `access` doesn't know which projects exist, so any other id gets what platform roles and Everyone allow. A `project` that is not a UUID is `400`. Any signed-in User. The web app uses it to hide what they can't use. |

Kinds and Scopes are lowercase in responses (`platform`, `project`, `own`, `project`, `all`). Missing Permission: `403` problem details. No token: `401`.

## Tables

| Table                     | Columns                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_permissions`      | `key` (PK), `heading`, `description`, `kind` (`PLATFORM`/`PROJECT`), `scopes` (comma-separated), `own_hint`, `first_seen_at`. Upserted at every startup; Grants don't reference it.                         |
| `access_roles`            | `id` (UUID), `key` (unique), `name`, `description`, `kind`, `built_in`, `customised`, `customised_at` (when a customised built-in Role's Grants were last chosen), `version`, `created_at`.                 |
| `access_role_grants`      | `role_id` (→ `access_roles`, cascade delete), `permission_key`, `scope` (null for platform permissions). Primary key (`role_id`, `permission_key`).                                                         |
| `access_audit_entries`    | `id`, `seq` (order of writing), `at`, `actor_id` (null for the system), `action`, `target_type`, `target_key`, `before`, `after` (JSONB). Append-only: a trigger refuses `UPDATE`, `DELETE` and `TRUNCATE`. |
| `access_role_assignments` | `id`, `role_id` (→ `access_roles`), `user_id`, `project_id` (null for platform roles), `created_at`. Unique (`user_id`, `role_id`) for platform roles; unique (`user_id`, `project_id`) for project roles.  |

## Web app

**Roles & access** in the user menu, shown only to holders of `access:role:manage`, opens `/settings/roles`: platform roles and project roles in two sections with name, built-in badge, description, key, holders and Permission count, and **New Role** (name, a key suggested from it, description, platform or project). `/settings/roles/:key` shows one Role: rename, **Reset to defaults** (customised built-in Roles), **Delete** (custom Roles), the new-Permissions notice, and its Permissions grouped by heading, each with a checkbox and, where there is a choice, a Scope dropdown limited to the allowed Scopes, with the own hint. Locked Grants and reserved Permissions are shown but disabled; Platform admin is read-only. **Save Permissions** saves all at once; a stale save shows "This Role changed since you opened it". A platform role other than Everyone has a second tab, **People**, for holders of `access:role:assign`: who holds it (avatar, name, email, since when), an email field with **Add**, and **Remove** with a confirmation on every row but your own. Refusals (no such User, already holds it, last Platform admin) are shown with the server's message. **Audit log** in the user menu, shown only to holders of `access:audit:view`, opens `/settings/audit`: entries newest first and paged (pages stay put while new entries arrive; **Show newest** starts again), with when, who (or System), the Role (linked only while it exists and for readers who may open Roles) and one line saying what changed. A project role lists only Permissions project roles can hold.
