# mail

Sends email for the other modules. It knows nothing about Users or why a message is sent: callers write the message and pass it in. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Public interface

| Type         | Use                                                                                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mailer`     | `send(Mail)`. A delivery failure is logged and never thrown, so a mail problem can't undo what the caller already did. Nothing is retried. Call it after your transaction has committed.                                                                                                                                    |
| `Mail`       | One email to one person: `to`, `subject`, `html` and `text` (the same message as plain text).                                                                                                                                                                                                                               |
| `MailAssets` | `url(file)`: the public address of an image used in an email (the Nimbus icon), or empty when `MAIL_ASSETS_URL` is blank or is not a public `https://` address (a startup WARN says so), in which case the email does without the image. `MailAssets.NIMBUS_ICON_DARK` names the icon file, so callers do not spell it out. |

Everything under `mail.internal` is private to the module.

## Why not an event

`identity` calls `Mailer` directly instead of publishing an event for `mail` to handle. Modulith stores every event in `event_publication`, so an event carrying a Verification code would keep the code in the database in plain text, which the code's keyed hash exists to avoid. Do not "tidy" this into an event. Any module that mails something secret should do the same.

## Implementations

`MailConfiguration` picks one at startup: **Brevo** when `BREVO_API_KEY` is set, otherwise **Logging**, with a WARN at startup because codes then appear in the log. Whitespace around the settings is dropped. A wrong key or an unverified sender is not checked at startup (that would need a network call); it shows up as the first send WARN. A key without `MAIL_FROM` stops the app from starting, with a message saying so.

- **Logging**: writes the recipient, subject and plain-text body to the log at INFO instead of sending, so Nimbus works locally without a mail service. A developer registers, copies the code from the API log and enters it.
- **Brevo**: `POST https://api.brevo.com/v3/smtp/email` with the key in an `api-key` header, through Spring's `RestClient`. It sends our own HTML and plain text (`htmlContent`, `textContent`), not Brevo-hosted templates. REST rather than SMTP, because many hosts block outbound SMTP ports and Brevo's answer carries a `messageId` for bounce webhooks later.
  - Failure: a Brevo error answer (status and Brevo's message) or a timeout is logged at WARN as "Could not send an email" and never thrown or retried. The API key is never logged. The `messageId` of an accepted email is logged at DEBUG.
  - Timeout: 5 seconds to connect and 5 for the response (`nimbus.mail.timeout`, JDK `HttpClient`). Registration sends the first code on the request thread, so a slow Brevo costs a sign-up roughly that long (DNS lookup is not covered by either timeout), then the User asks for a new code with Resend.
  - The log line names the recipient and subject, and cuts the answer from Brevo at 500 characters.

## Configuration

Set in `apps/api/.env` (documented in `.env.example`); nothing is tracked.

| Variable          | Setting                     | Meaning                                                                                                                                                 |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BREVO_API_KEY`   | `nimbus.mail.brevo-api-key` | Brevo API key (v3). Blank selects the logging implementation.                                                                                           |
| `MAIL_FROM`       | `nimbus.mail.from`          | Sender address. Must be a verified sender in Brevo. Required when the key is set.                                                                       |
| `MAIL_FROM_NAME`  | `nimbus.mail.from-name`     | Sender name recipients see. Defaults to `Nimbus`, also when left empty.                                                                                 |
| (none)            | `nimbus.mail.timeout`       | Connect and read timeout for Brevo. Defaults to `5s`.                                                                                                   |
| `MAIL_ASSETS_URL` | `nimbus.mail.assets-url`    | Public https address that serves the images in emails, without a trailing slash, e.g. `https://nimbus-assets.pages.dev`. Blank: emails carry no images. |

## Images in emails

An email cannot carry its images, and a mail program cannot reach `localhost`, so images are linked from a public address (`MAIL_ASSETS_URL`). The Verification code email uses `nimbus-icon-dark.png`, the file in `apps/web/public`, uploaded to that address with the same name (for example to a Cloudflare Pages site). Without the setting the header shows an orange circle and the word "nimbus". Use PNG, not SVG: Gmail and Outlook do not show SVG in email. Mail already sent keeps pointing at the file, so do not change what it shows later without meaning to.

## Brevo limits

- Brevo only sends from a verified sender. Until a domain is authenticated (DKIM, DMARC), it rewrites the sender to an `@brevosend.com` address, and that mail is more likely to land in spam at Outlook and Hotmail. A personal `MAIL_FROM` is fine for now; moving to our own domain later needs only a config change.
- The free plan allows 300 emails a day, shared by API and SMTP. The per-address send limits in [identity.md](identity.md) keep one person from using much of it.

## Events published

None.

## Tables

None.
