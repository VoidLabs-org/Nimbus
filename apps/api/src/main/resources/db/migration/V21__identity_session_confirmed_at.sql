-- identity: when the User last confirmed it was them in this Session ("Confirm it's you": their password, and their
-- Sign-in code or a Recovery code with Two-step verification). Changing the email needs a sign-in or a confirmation
-- from the last 10 minutes. Null until they confirm.

ALTER TABLE sessions
    ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE;
