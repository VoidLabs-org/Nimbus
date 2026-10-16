-- Every change to access, kept for good. Append-only: the trigger below refuses updates, deletes and truncation, so
-- not even a bug or a stray query can rewrite history.
CREATE TABLE access_audit_entries (
    id          UUID PRIMARY KEY,
    -- Strict order of writing; two changes in the same instant still come back in the order they happened.
    seq         BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    at          TIMESTAMPTZ  NOT NULL,
    -- NULL when the system did it (e.g. a warning at startup).
    actor_id    UUID,
    action      VARCHAR(50)  NOT NULL,
    target_type VARCHAR(30)  NOT NULL,
    target_key  VARCHAR(100) NOT NULL,
    before      JSONB,
    after       JSONB
);

CREATE FUNCTION access_audit_entries_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'access_audit_entries is append-only: entries are never edited or deleted';
END
$$;

CREATE TRIGGER access_audit_entries_no_update_or_delete
    BEFORE UPDATE OR DELETE ON access_audit_entries
    FOR EACH ROW EXECUTE FUNCTION access_audit_entries_append_only();

CREATE TRIGGER access_audit_entries_no_truncate
    BEFORE TRUNCATE ON access_audit_entries
    FOR EACH STATEMENT EXECUTE FUNCTION access_audit_entries_append_only();
