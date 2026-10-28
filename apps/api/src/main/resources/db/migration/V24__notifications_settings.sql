-- Only the email switches that differ from their type's default are stored.
CREATE TABLE notification_settings (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type varchar(64) NOT NULL,
    email boolean NOT NULL,
    PRIMARY KEY (user_id, type)
);
