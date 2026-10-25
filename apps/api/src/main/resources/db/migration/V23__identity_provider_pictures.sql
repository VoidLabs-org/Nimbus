-- identity: each Linked identity keeps the picture its provider last sent, refreshed on every sign-in with it and gone
-- with the identity when it is disconnected. Provider pictures stay at Google and GitHub; only the address is kept.
--
-- Users who never chose a Profile picture (picture_source null) see the picture of their earliest-linked identity that
-- has one. users.avatar_url is only the fallback for Users whose identities have no picture yet: which provider set it
-- isn't known, so it is cleared (by the application) on the next provider sign-in that fills an identity's picture.

ALTER TABLE linked_identities
    ADD COLUMN picture_url TEXT;
