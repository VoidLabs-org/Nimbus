-- When each Permission first appeared in the code, kept across restarts, and when a built-in Role was customised.
-- Together they tell an admin which defaults a customised Role is missing because they are new, not because the
-- admin removed them.
ALTER TABLE access_permissions ADD COLUMN first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE access_roles ADD COLUMN customised_at TIMESTAMPTZ;
