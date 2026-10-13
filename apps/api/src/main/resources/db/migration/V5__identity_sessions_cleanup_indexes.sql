-- identity: the cleanup job looks for sessions that ended long ago, by when they were revoked or hit their cap.
-- Without these it would read every session on each run. Only revoked sessions are in the second index.

CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE INDEX sessions_revoked_at_idx ON sessions (revoked_at) WHERE revoked_at IS NOT NULL;
