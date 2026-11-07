-- Who created each project, for the Projects table. Every project so far was created by its first Member (creating
-- a project adds its creator as the first Member in the same transaction), so existing rows take theirs.
ALTER TABLE projects ADD COLUMN created_by UUID REFERENCES users(id);

UPDATE projects
SET created_by = (
    SELECT m.user_id FROM project_members m
    WHERE m.project_id = projects.id
    ORDER BY m.added_at, m.user_id
    LIMIT 1
);
