-- identity: what the Connected accounts card shows next to a Linked identity ("Connected as ..."), and which
-- providers a User has disconnected.
--
-- account_name is the Google email or the GitHub username. The provider's own user id is what identifies the
-- login and the card needs something a person recognises, so it is set when the identity is linked and refreshed
-- on every sign-in with that provider. Identities linked before this migration stay null until then.
ALTER TABLE linked_identities
    ADD COLUMN account_name TEXT;

-- A User who disconnects a provider is not linked to it again by a sign-in on their email; only connecting it
-- from the Security page does that (ADR 0004). The mark is per provider, not per provider account. Nothing writes
-- this table yet.
CREATE TABLE disconnected_providers
(
    user_id         UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider        TEXT                     NOT NULL,
    disconnected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (user_id, provider)
);
