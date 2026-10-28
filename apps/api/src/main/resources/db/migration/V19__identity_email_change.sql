-- identity: a pending email change is a third kind of emailed code. Its row also holds the new address, which
-- becomes the User's email once the code mailed there is entered. The other kinds leave it null.

ALTER TABLE emailed_codes
    DROP CONSTRAINT emailed_codes_kind_check,
    ADD CONSTRAINT emailed_codes_kind_check CHECK (kind IN ('VERIFICATION', 'RESET', 'EMAIL_CHANGE')),
    ADD COLUMN new_email TEXT,
    ADD CONSTRAINT emailed_codes_new_email_check CHECK ((kind = 'EMAIL_CHANGE') = (new_email IS NOT NULL));
