# mail

Provides the shared email layout and sends email for the other modules. It knows nothing about Users or why a message is sent: callers own the wording and plain-text alternative, build the HTML with the shared layout, and pass the message in. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Public interface

| Type         | Use                                                                                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mailer`     | `send(Mail)`. A delivery failure is logged and never thrown, so a mail problem can't undo what the caller already did. Nothing is retried. Call it after your transaction has committed.                                                                                                                                    |
| `Mail`       | One email to one person: `to`, `subject`, `html` and `text` (the same message as plain text).                                                                                                                                                                                                                               |
| `MailAssets` | `url(file)`: the public address of an image used in an email (the Nimbus icon), or empty when `MAIL_ASSETS_URL` is blank or is not a public `https://` address (a startup WARN says so), in which case the email does without the image. `MailAssets.NIMBUS_ICON_DARK` names the icon file, so callers do not spell it out. |

Everything under `mail.internal` is private to the module.

### Shared layout

`MailFrame` and `NoticeMail` are public utilities in `com.nimbus.api.mail`, available to any module without a Spring bean. They render HTML only; callers supply the recipient, subject and plain-text body when constructing a `Mail`.

- `MailFrame.html(title, preview, heading, logoUrl, card, footer)` renders the "Ink header band" frame: a dark header with the Nimbus logo and heading, a light content card, and a footer. `logoUrl` is an `Optional<String>` from `MailAssets`; without it the header uses an orange circle. All text and the logo URL are HTML-escaped, except `card`, which is caller-supplied HTML and must already escape any dynamic content. `MailFrame.escape(value)` escapes text and double-quoted attribute values; `MailFrame.MUTED_STYLE` supplies the shared muted paragraph style for custom cards. Subjects, titles and preview lines must not contain secrets because inbox lists and lock screens can show them.
- The `MailFrame.html` overload with a final `mobileStyles` argument appends caller-owned CSS inside the `max-width:620px` media query. Pass trusted application CSS only, never user content. Identity supplies its code-card rules here; the shared frame contains no code-card styling. Custom cards can use `class="muted"` for body text, `class="ink"` for emphasis, `class="tile"` for inset backgrounds and `class="rule"` for borders to receive the shared dark-mode colors. Put `MUTED_STYLE` in a `style` attribute and use `class="muted"` on the same element.
- `NoticeMail.html(title, heading, line, tile, button, url, footer, logoUrl)` fills that frame with a line of text, an optional supporting tile and a button. `tile` is an `Optional<String>`; `Optional.empty()` omits its markup entirely, so ordinary Notifications need no security warning. All text is escaped, including the button URL. The line also supplies the hidden inbox preview by default; the overload with `preview` after `title` lets the caller supply a separate preview without secrets.
- `NoticeMail.html(title, heading, line, details, tile, footer, logoUrl)` is the notice with nothing to open: the line, then `details` (a non-empty `List<NoticeMail.Detail>` of label and value rows, in order), then the optional tile, and no button. The line is the inbox preview.
- `NoticeMail.time(instant)` formats when something happened the way every notice shows it, `24 Oct 2026, 09:05 UTC`: English whatever the server's locale, and UTC, since Nimbus stores no time zone per User.
- Button URLs must be absolute `http` or `https` URLs with a host; malformed URLs, relative paths and other schemes throw `IllegalArgumentException`. HTTP supports local development. Callers must still trust the destination host: scheme validation does not make arbitrary external destinations safe.
- Layout arguments, optional containers, CSS and text passed to `escape` must be non-null. A missing argument throws `NullPointerException` naming that argument; an absent logo or tile uses `Optional.empty()`. Layout validation errors propagate to callers; `Mailer`'s delivery-failure policy does not apply to HTML construction.

`identity` uses `MailFrame` for Verification and Reset code emails, keeping its code card and wording in `identity`, and `NoticeMail` for provider connection and disconnection emails and, without a button, the notice to an old address after an email change. Other modules can use the same layouts with their own wording.

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
