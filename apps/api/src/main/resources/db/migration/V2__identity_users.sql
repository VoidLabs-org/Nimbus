-- identity: people who can sign in. The app stores emails lower-cased, so the unique constraint is case-insensitive.
-- No CHECK (email = lower(email)): Java's and Postgres' lower() can disagree on non-ASCII letters.

CREATE TABLE users
(
    id             UUID                     NOT NULL,
    email          TEXT                     NOT NULL,
    display_name   TEXT                     NOT NULL,
    -- Null for Users who only sign in with a Linked identity (Google/GitHub).
    password_hash  TEXT,
    avatar_url     TEXT,
    -- True once a provider has proven the User owns the email. Password sign-ups start unverified.
    email_verified BOOLEAN                  NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);
