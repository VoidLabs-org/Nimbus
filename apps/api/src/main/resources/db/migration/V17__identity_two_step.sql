-- identity: Two-step verification. A User who turns it on has one authenticator (the key their app makes Sign-in
-- codes from) and a set of single-use Recovery codes.
--
-- The key is encrypted (AES-GCM, with a key from TWO_STEP_SECRET), so a copy of the database alone can't make
-- Sign-in codes. last_used_step is the newest 30-second step whose code was accepted, so a code is never accepted
-- twice.
CREATE TABLE two_step_authenticators
(
    user_id        UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    encrypted_key  BYTEA                    NOT NULL,
    enabled_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_step BIGINT
);

-- Only a keyed hash of each Recovery code is stored, so codes can't be read back; a new set replaces the old one.
CREATE TABLE recovery_codes
(
    id        UUID PRIMARY KEY,
    user_id   UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash TEXT                     NOT NULL,
    used_at   TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id, code_hash)
);
