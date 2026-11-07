-- A project's creator who is no longer known leaves created_by null instead of blocking the User's deletion, as with
-- the other references to a User who acted (issue_deletions.actor_id).
ALTER TABLE projects DROP CONSTRAINT projects_created_by_fkey;
ALTER TABLE projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;
