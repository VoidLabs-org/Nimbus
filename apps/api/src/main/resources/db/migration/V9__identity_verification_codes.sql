-- identity: the Verification code that proves a User owns their email. At most one live code per User; a new one
-- replaces the old. Only a keyed hash is stored, so a database leak reveals no live code.

CREATE TABLE verification_codes
(
    user_id     UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash   TEXT                     NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Wrong tries so far; the code is cancelled (deleted) when they reach the limit.
    wrong_tries INTEGER                  NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id)
);
