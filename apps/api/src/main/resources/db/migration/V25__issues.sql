-- Statuses are created lazily, the first time a project needs them (nothing listens to ProjectCreated).
CREATE TABLE issue_statuses (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(30) NOT NULL,
    category VARCHAR(11) NOT NULL,
    position INTEGER NOT NULL,
    CONSTRAINT issue_statuses_category CHECK (category IN ('TODO', 'IN_PROGRESS', 'DONE'))
);

CREATE UNIQUE INDEX issue_statuses_project_name ON issue_statuses(project_id, lower(name));

-- One row per project, locked while an Issue number is taken and while the first Statuses are created.
-- Numbers only go up, so a deleted Issue's number is never given again.
CREATE TABLE issue_counters (
    project_id UUID PRIMARY KEY REFERENCES projects(id),
    last_number INTEGER NOT NULL
);

CREATE TABLE issues (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    number INTEGER NOT NULL,
    type VARCHAR(5) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(6) NOT NULL,
    status_id UUID NOT NULL REFERENCES issue_statuses(id),
    reporter_id UUID NOT NULL REFERENCES users(id),
    assignee_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL,
    CONSTRAINT issues_project_number UNIQUE (project_id, number),
    CONSTRAINT issues_type CHECK (type IN ('Story', 'Bug', 'Chore')),
    CONSTRAINT issues_priority CHECK (priority IN ('Urgent', 'High', 'Medium', 'Low'))
);

CREATE INDEX issues_status_id ON issues(status_id);
CREATE INDEX issues_assignee_id ON issues(assignee_id);

-- Never edited. actor_id is null for changes the system makes.
CREATE TABLE issue_history (
    id UUID PRIMARY KEY,
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    at TIMESTAMP WITH TIME ZONE NOT NULL,
    field VARCHAR(30) NOT NULL,
    before_value TEXT,
    after_value TEXT
);

CREATE INDEX issue_history_issue_at ON issue_history(issue_id, at DESC);
