-- identity: when each User's password was last set, for "Last changed" on Profile. Passwords set before this stay
-- null (unknown), as do Users without one.

ALTER TABLE users
    ADD COLUMN password_changed_at TIMESTAMP WITH TIME ZONE;
