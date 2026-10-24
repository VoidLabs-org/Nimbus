# Email layout fixtures

Captured from commit `c2a9cfe`, before the review fixes, using fixed inputs in `MailLayoutTests` and `IdentityMailLayoutTests`. Tests read these files; they never regenerate them. The `email-change-*` (code to a new address, #163) and `email-changed-*` (notice to the old address) fixtures were captured in #165, which also added the dark-mode `.rule` border colour to every fixture.

The frame, notice and provider fixtures omit the unused `.code` mobile rule, which now belongs to identity's code card. Verification and reset fixtures retain the original output exactly. `.mail` fixtures contain the complete `Mail` record, including recipient, subject, HTML and plain text.

The `.html.snap` suffix keeps formatters from rewriting the exact HTML being tested.

Review fixture changes as changes to delivered email. These tests compare source output, not rendering in individual email clients.
