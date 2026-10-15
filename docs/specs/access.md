# access

Owns **Permissions**, **Roles**, **Grants**, **Scopes** and **Role assignments**: who may do what, where. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). Every other module depends on `access`, and `access` depends only on `identity`'s public API; it stores User and project ids but never knows other modules ([ADR 0002](../adr/0002-per-project-roles-and-access-as-a-foundation.md)). Feature spec: #42.

## Public interface

| Type                           | Use                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ModulePermissions`            | Implement it as a bean in your module to declare its Permissions. Collected into the catalog at startup.                                                                                                                                                           |
| `Permission`                   | One declaration: `Permission.platform(key, heading, description)` or `Permission.project(key, heading, description, scopes...)`, then `.ownHint(...)` and `.grantedTo(builtInRole[, scope])` for its defaults in the built-in Roles.                               |
| `BuiltInRole`, `Kind`, `Scope` | The built-in Roles, platform or project, and `OWN` / `PROJECT` / `ALL`.                                                                                                                                                                                            |
| `PlatformPermissions`          | `holds(userId, key)` and `require(userId, key)`: whether a User holds a platform permission, through Everyone or their platform roles. `false` for keys that aren't platform permissions in the catalog.                                                           |
| `@Authorize("key")`            | On a controller method or class: requires the signed-in User to hold that platform permission, `403` otherwise. Only for platform permissions; project permissions need the project, so services ask `access` explicitly (coming with the project check API, #48). |
| `PermissionDeniedException`    | Thrown by `require`; answered with `403` problem details from any module.                                                                                                                                                                                          |

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
| `projects:member:manage`   | project  | `PROJECT`      | Project admin          | `projects`  |

`access:role:manage` and `access:role:assign` are reserved to Platform admin: no other Role may hold them (enforced once Roles can be edited, #45).

## Roles

| Role           | Key              | Kind     | Holds                                                                                        |
| -------------- | ---------------- | -------- | -------------------------------------------------------------------------------------------- |
| Platform admin | `platform_admin` | platform | Every Permission, project ones with `ALL`, including Permissions added later. Locked.        |
| Everyone       | `everyone`       | platform | Every signed-in User holds it without being assigned; it is never listed with holders.       |
| Project admin  | `project_admin`  | project  | Every project permission with `PROJECT`.                                                     |
| Developer      | `developer`      | project  | No `projects` Permissions by default; later modules add theirs (e.g. editing Issues).        |
| Viewer         | `viewer`         | project  | No `projects` Permissions by default. Members see their own projects without any Permission. |

## Startup

Before the API takes requests, every startup:

1. Rebuilds `access_permissions` from the declarations.
2. Creates any missing built-in Role, and resets every built-in Role that is not customised to the code defaults. Platform admin is always reset to every Permission. A customised built-in Role is left exactly as it is.
3. Logs a warning for each Grant whose key is no longer in the catalog. Such a Grant allows nothing and is never deleted automatically: rename or remove it with a Flyway migration in the same PR as the change.
4. Gives Platform admin to the User with `NIMBUS_ADMIN_EMAIL` (`nimbus.admin.email`) if their email is verified: the seeded admin, or someone who proved the address with Google or GitHub. An unverified match (someone who registered that email with a password) gets nothing and is logged with the reason, so they can't take over Nimbus. Nothing happens when the setting is empty.

Running it again changes nothing. The sync takes a Postgres advisory lock for its transaction, so instances starting at the same time against one database wait for each other instead of colliding.

**Shared dev database:** the catalog and the uncustomised built-in Roles always follow the code of the instance that started last. Two developers on branches with different Permissions keep resetting each other's catalog and defaults on the shared dev database (a running server keeps working, but its Roles may not match its code until it restarts). Work on new or changed Permissions against a local database (`docker compose up -d`).

## REST endpoints

| Endpoint                         | Behaviour                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/access/permissions`    | The catalog sorted by heading and key: `{permissions: [{key, heading, description, kind, scopes, ownHint}]}`. Needs `access:role:manage`.                                                                             |
| `GET /api/access/roles`          | Every Role, platform roles first, then built-in order, then name: `{roles: [{key, name, description, kind, builtIn, customised, permissions, holders}]}`. `holders` is null for Everyone. Needs `access:role:manage`. |
| `GET /api/access/roles/{key}`    | One Role with `version` and `grants: [{permission, scope}]` (scope null for platform permissions; Grants for unknown keys left out). `404` for an unknown key. Needs `access:role:manage`.                            |
| `GET /api/access/me/permissions` | The signed-in User's platform permissions: `{platform: [...]}`, sorted. Any signed-in User. The web app uses it to hide what they can't use.                                                                          |

Kinds and Scopes are lowercase in responses (`platform`, `project`, `own`, `project`, `all`). Missing Permission: `403` problem details. No token: `401`.

## Tables

| Table                     | Columns                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_permissions`      | `key` (PK), `heading`, `description`, `kind` (`PLATFORM`/`PROJECT`), `scopes` (comma-separated), `own_hint`. Rebuilt at every startup; Grants don't reference it.                                          |
| `access_roles`            | `id` (UUID), `key` (unique), `name`, `description`, `kind`, `built_in`, `customised`, `version`, `created_at`.                                                                                             |
| `access_role_grants`      | `role_id` (→ `access_roles`, cascade delete), `permission_key`, `scope` (null for platform permissions). Primary key (`role_id`, `permission_key`).                                                        |
| `access_role_assignments` | `id`, `role_id` (→ `access_roles`), `user_id`, `project_id` (null for platform roles), `created_at`. Unique (`user_id`, `role_id`) for platform roles; unique (`user_id`, `project_id`) for project roles. |

## Web app

**Roles & access** in the user menu, shown only to holders of `access:role:manage`, opens `/settings/roles`: platform roles and project roles in two sections with name, built-in badge, description, key, holders and Permission count. `/settings/roles/:key` shows one Role read-only: its Permissions grouped by heading, each with a checkbox for whether it is granted, the own hint, and the Scope. A project role lists only Permissions project roles can hold.
