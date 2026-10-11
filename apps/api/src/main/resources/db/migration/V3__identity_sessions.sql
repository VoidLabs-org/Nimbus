-- identity: sign-in sessions. Each sign-in starts a session (a refresh-token family); every refresh replaces its
-- token with a new one. Tokens are stored only as SHA-256 hashes, so a database leak can't be replayed.

CREATE TABLE sessions
(
    id         UUID                     NOT NULL,
    user_id    UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Absolute cap: no refresh is accepted after this, however active the session is.
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Set when the session ends early, e.g. because a used refresh token was presented again.
    revoked_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE refresh_tokens
(
    id         UUID                     NOT NULL,
    session_id UUID                     NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    token_hash TEXT                     NOT NULL,
    issued_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Sliding expiry from issue, capped at the session's expires_at.
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Set when the token is exchanged for a new one. Presenting it again ends the whole session.
    used_at    TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens (session_id);
