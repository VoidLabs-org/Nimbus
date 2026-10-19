CREATE TABLE notifications (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type varchar(64) NOT NULL,
    dedupe_key varchar(255) NOT NULL UNIQUE,
    project_id uuid,
    issue_key varchar(64),
    actor_id uuid,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    read_at timestamptz,
    email_due_at timestamptz,
    email_group_started_at timestamptz,
    emailed_at timestamptz
);

CREATE INDEX notifications_panel ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_email_due ON notifications(email_due_at) WHERE emailed_at IS NULL;
CREATE INDEX notifications_retention ON notifications(created_at);
