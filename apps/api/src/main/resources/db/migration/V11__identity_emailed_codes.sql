-- identity: one table for the codes Nimbus emails to prove a User owns their address, replacing
-- verification_codes (V9) and reset_codes (V10). At most one live code per User and kind; a new one replaces the
-- old, and a pending code of one kind never replaces another. Only a keyed hash is stored, so a database leak
-- reveals no live code.

CREATE TABLE emailed_codes
(
    user_id     UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind        TEXT                     NOT NULL CHECK (kind IN ('VERIFICATION', 'RESET')),
    code_hash   TEXT                     NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Wrong tries so far; the code is cancelled (deleted) when they reach the limit.
    wrong_tries INTEGER                  NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, kind)
);

INSERT INTO emailed_codes (user_id, kind, code_hash, created_at, expires_at, wrong_tries)
SELECT user_id, 'VERIFICATION', code_hash, created_at, expires_at, wrong_tries
FROM verification_codes;

INSERT INTO emailed_codes (user_id, kind, code_hash, created_at, expires_at, wrong_tries)
SELECT user_id, 'RESET', code_hash, created_at, expires_at, wrong_tries
FROM reset_codes;

DROP TABLE verification_codes;
DROP TABLE reset_codes;
