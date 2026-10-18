# mail

Sends email for the other modules. It knows nothing about Users or why a message is sent: callers write the message and pass it in. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Public interface

| Type     | Use                                                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mailer` | `send(Mail)`. A delivery failure is logged and never thrown, so a mail problem can't undo what the caller already did. Nothing is retried. Call it after your transaction has committed. |
| `Mail`   | One email to one person: `to`, `subject`, `html` and `text` (the same message as plain text).                                                                                            |

Everything under `mail.internal` is private to the module.

## Why not an event

`identity` calls `Mailer` directly instead of publishing an event for `mail` to handle. Modulith stores every event in `event_publication`, so an event carrying a Verification code would keep the code in the database in plain text, which the code's keyed hash exists to avoid. Do not "tidy" this into an event. Any module that mails something secret should do the same.

## Implementations

- **Logging** (the only one so far): writes the recipient, subject and plain-text body to the log at INFO instead of sending, so Nimbus works locally without a mail service. A developer registers, copies the code from the API log and enters it.

The Brevo implementation arrives in a later ticket of the email verification feature; this page will describe its configuration then. It must not make the caller wait on Brevo: registration sends the first code on the request thread, so a slow or timing-out provider would slow every sign-up. Give it a short timeout, or send on an executor.

## Events published

None.

## Tables

None.
