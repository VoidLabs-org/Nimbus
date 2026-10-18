-- identity: when a session last got a new refresh token, kept on the session itself. The Security page lists a
-- User's running sessions with this, instead of reading every refresh token each session has collected (about 96 a
-- day while the app stays open, up to about 8,600 over a session's 90 days).

ALTER TABLE sessions
    ADD COLUMN last_active_at TIMESTAMP WITH TIME ZONE;

-- Sessions that already exist: their newest refresh token, or their start when they have none.
UPDATE sessions s
SET last_active_at = COALESCE((SELECT max(t.issued_at) FROM refresh_tokens t WHERE t.session_id = s.id), s.started_at);

ALTER TABLE sessions
    ALTER COLUMN last_active_at SET NOT NULL;
