-- Kept after an Issue is deleted, for a later activity page. No foreign key to issues: the Issue is gone.
CREATE TABLE issue_deletions (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_key VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX issue_deletions_project ON issue_deletions(project_id, deleted_at);
