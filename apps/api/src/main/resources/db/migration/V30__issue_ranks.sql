-- issues: each Issue's Rank, its place in its project's single manual order (ADR 0012). Only the server makes keys
-- (RankKeys); they sort byte by byte, hence COLLATE "C": the database's own collation would order them wrongly.
ALTER TABLE issues ADD COLUMN rank TEXT COLLATE "C";

-- The n-th key (from 0) of the run a0 to az, then b00 to bzz, then c000 to czzz, and so on: the keys RankKeys makes
-- when it appends key after key. Any increasing run of valid keys would do; RankKeys makes new keys around them.
-- Dropped below, since a pg_temp function outlives the migration on its pooled connection.
CREATE FUNCTION pg_temp.appended_rank_key(n BIGINT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    digits CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    head TEXT := 'a';
    width INT := 1;
    capacity BIGINT := 62;
    key TEXT := '';
BEGIN
    WHILE n >= capacity LOOP
        n := n - capacity;
        head := chr(ascii(head) + 1);
        width := width + 1;
        capacity := capacity * 62;
    END LOOP;
    FOR i IN 1..width LOOP
        key := substr(digits, (n % 62)::INT + 1, 1) || key;
        n := n / 62;
    END LOOP;
    RETURN head || key;
END;
$$;

-- Existing Issues keep the order the Board showed them in: most recently updated first.
UPDATE issues i
SET rank = pg_temp.appended_rank_key(o.n)
FROM (
    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY updated_at DESC, number DESC) - 1 AS n
    FROM issues
) o
WHERE o.id = i.id;

DROP FUNCTION pg_temp.appended_rank_key(BIGINT);

ALTER TABLE issues ALTER COLUMN rank SET NOT NULL;
ALTER TABLE issues ADD CONSTRAINT issues_project_rank UNIQUE (project_id, rank);

-- Each Board column reads its first page in Rank order straight from this index; it also covers lookups by Status.
DROP INDEX issues_status_id;
CREATE INDEX issues_status_rank ON issues (status_id, rank);
