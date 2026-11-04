-- Issues the notifications module was told are deleted, so every Notification about one links to its project instead.
CREATE TABLE notification_deleted_issues (
    project_id uuid NOT NULL,
    issue_key varchar(64) NOT NULL,
    project_key varchar(10) NOT NULL,
    PRIMARY KEY (project_id, issue_key)
);
