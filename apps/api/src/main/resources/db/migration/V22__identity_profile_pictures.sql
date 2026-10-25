-- identity: what each User shows as their Profile picture, and the photo they uploaded (stored in the bucket under
-- its key, see the storage module). Null picture_source means the User never chose: they see avatar_url, the picture
-- their last Google or GitHub sign-in brought, as before. The key changes with every upload.

ALTER TABLE users
    ADD COLUMN picture_source      TEXT,
    ADD COLUMN uploaded_picture_key TEXT,
    ADD COLUMN uploaded_picture_at TIMESTAMP WITH TIME ZONE,
    ADD CONSTRAINT users_picture_source_check
        CHECK (picture_source IN ('uploaded', 'google', 'github', 'initials')),
    ADD CONSTRAINT users_uploaded_picture_key UNIQUE (uploaded_picture_key);
