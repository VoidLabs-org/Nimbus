CREATE TABLE projects (
    id UUID PRIMARY KEY,
    key VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1000),
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT projects_key_format CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$')
);

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id UUID NOT NULL REFERENCES users(id),
    added_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX project_members_user_id ON project_members(user_id);
