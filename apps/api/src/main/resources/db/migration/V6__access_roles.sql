-- The Permission catalog, rebuilt from the code at every startup. Grants don't reference it, so a Permission
-- removed from the code never deletes Grants: they are ignored and logged until a migration renames or removes them.
CREATE TABLE access_permissions (
    key         VARCHAR(100) PRIMARY KEY,
    heading     VARCHAR(50)  NOT NULL,
    description VARCHAR(255) NOT NULL,
    kind        VARCHAR(10)  NOT NULL CHECK (kind IN ('PLATFORM', 'PROJECT')),
    -- The Scopes it may have in project roles, comma-separated (e.g. 'OWN,PROJECT'); empty when none.
    scopes      VARCHAR(50)  NOT NULL,
    own_hint    VARCHAR(255)
);

CREATE TABLE access_roles (
    id          UUID PRIMARY KEY,
    key         VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL,
    kind        VARCHAR(10)  NOT NULL CHECK (kind IN ('PLATFORM', 'PROJECT')),
    built_in    BOOLEAN      NOT NULL,
    -- A built-in Role an admin changed: startup no longer resets it to the code defaults.
    customised  BOOLEAN      NOT NULL,
    -- Changes on every edit, so a save based on an older version can be refused.
    version     INTEGER      NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL
);

CREATE TABLE access_role_grants (
    role_id        UUID         NOT NULL REFERENCES access_roles (id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL,
    -- NULL for platform permissions.
    scope          VARCHAR(10)  CHECK (scope IN ('OWN', 'PROJECT', 'ALL')),
    PRIMARY KEY (role_id, permission_key)
);

-- A User holding a Role, across Nimbus (project_id NULL) or in one project. access stores only ids: Users and
-- projects belong to other modules.
CREATE TABLE access_role_assignments (
    id         UUID PRIMARY KEY,
    role_id    UUID        NOT NULL REFERENCES access_roles (id),
    user_id    UUID        NOT NULL,
    project_id UUID,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX access_role_assignments_platform ON access_role_assignments (user_id, role_id)
    WHERE project_id IS NULL;

-- One project role per User per project.
CREATE UNIQUE INDEX access_role_assignments_project ON access_role_assignments (user_id, project_id)
    WHERE project_id IS NOT NULL;
