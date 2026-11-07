-- issue_statuses: the Status new Issues start in, stored per project instead of being worked out from the order.
-- It is a To do Status, and a project has exactly one.
ALTER TABLE issue_statuses ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing projects keep what they had: new Issues started in the first To do Status, in order.
UPDATE issue_statuses s
SET is_default = TRUE
FROM (
    SELECT DISTINCT ON (project_id) id
    FROM issue_statuses
    WHERE category = 'TODO'
    ORDER BY project_id, position
) first_to_do
WHERE s.id = first_to_do.id;

ALTER TABLE issue_statuses ADD CONSTRAINT issue_statuses_default_is_to_do CHECK (NOT is_default OR category = 'TODO');
CREATE UNIQUE INDEX issue_statuses_one_default ON issue_statuses (project_id) WHERE is_default;
