-- identity: Google/GitHub logins attached to a User. The provider's own user id identifies the login, not the
-- email, which the person can change at the provider. No provider tokens are stored.

CREATE TABLE linked_identities
(
    id               UUID                     NOT NULL,
    user_id          UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider         TEXT                     NOT NULL,
    provider_user_id TEXT                     NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT linked_identities_provider_user_key UNIQUE (provider, provider_user_id),
    -- One login per provider per User; also serves lookups by user_id.
    CONSTRAINT linked_identities_user_provider_key UNIQUE (user_id, provider)
);
