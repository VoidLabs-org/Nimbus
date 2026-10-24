-- identity: browsers where a User ticked "Don't ask again on this device for 30 days" at the Sign-in code. The
-- browser holds a random 256-bit token in the two_step_remembered cookie; only its SHA-256 is kept here. A row lasts
-- a fixed 30 days from when it was ticked (using the browser doesn't extend it).
CREATE TABLE remembered_browsers
(
    id         UUID PRIMARY KEY,
    user_id    UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT                     NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX remembered_browsers_user_id ON remembered_browsers (user_id);

CREATE INDEX remembered_browsers_expires_at ON remembered_browsers (expires_at);
