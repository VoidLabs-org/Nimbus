# Notifications

The `notifications` module turns domain events into Notifications for one User. It listens to `identity`; identity never calls it. It does not call `issues` or read another module's tables. Recipient details come from identity's public `Users` API.

## Events consumed and delivery

- `PasswordChanged(userId, at, reset)` creates `PASSWORD_CHANGED` ("Password changed", or "Password reset" when `reset`), `LinkedIdentityConnected(userId, provider, accountName, at)` creates `LINKED_IDENTITY_CONNECTED` ("Google connected"), `LinkedIdentityDisconnected(userId, provider, at)` creates `LINKED_IDENTITY_DISCONNECTED` and `OtherSessionsSignedOut(userId, at)` creates `OTHER_SESSIONS_SIGNED_OUT` ("Signed out of other devices"). Each is a Security alert even when the User did it themselves, with a panel line (`snapshot.detail`, for example "If this wasn't you, reset it now.") and an immediate email. Their dedupe key is `<TYPE>:<userId>:<at>`, so a redelivered event is one Notification and two changes are two. The connect and disconnect emails used to be sent by `identity`; they live here now, so each change sends exactly one email. Codes in emails (verification, reset) stay with `identity`.
- `SignedIn(userId, sessionId, deviceLabel, at)` creates a `SIGNED_IN` Security alert for that User, including when they signed in themselves. Identity suppresses the Session that creates a User and publishes nothing on refresh.
- The Spring Modulith `@ApplicationModuleListener` runs asynchronously after the publishing transaction commits, in a separate transaction. Its delivery is recorded in `event_publication`; outstanding deliveries resume after restart.
- The dedupe key is `SIGNED_IN:<sessionId>`. An atomic insert with a unique constraint makes repeated or concurrent delivery create one Notification and attempt one email. A missing recipient is ignored.
- The stored JSON snapshot contains `title` ("New sign-in to your account") and `deviceLabel`; the other alerts store `title` and `detail` instead. The panel reads only the snapshot; later changes to the User or device parser do not rewrite it. No IP address, location, raw User-Agent or credential is stored here.
- A Security alert is only created and mailed for a User whose email is verified. After the Notification commits, `Mailer` sends the Security alert immediately, with the device, event time in UTC, a **Review security** link to `/settings/security`, and the "Security alerts are always sent and can't be turned off" footer. Both URLs use `nimbus.auth.public-url` (`PUBLIC_URL`); the layout uses mail's public `NoticeMail` and `MailAssets`.
- Email is best-effort, with no retries. A failed send is logged and the Notification is kept. As with the mail module's other sends, a process stopping between commit and send may lose the email; the stored Notification survives.

## Storage and retention

Migration V16 creates `notifications`:

| Columns                                                | Meaning                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `id`, `user_id`, `type`, `dedupe_key`                  | Notification id, recipient (FK to `users`, cascade delete), type and unique event key |
| `snapshot`, `created_at`, `read_at`                    | Stored display text, event time, and when it was first marked read (nullable)         |
| `project_id`, `issue_key`, `actor_id`                  | Nullable context columns; unused by `SIGNED_IN`                                       |
| `email_due_at`, `email_group_started_at`, `emailed_at` | Nullable delivery columns reserved for Issue email grouping; unused by `SIGNED_IN`    |

Migration V24 creates `notification_settings(user_id, type, email)`, keyed by `(user_id, type)` with `user_id` cascading on User delete. Only email switches that differ from the type's default are stored; saving the default deletes the row. Defaults: email on for `ISSUE_ASSIGNED`, `ISSUE_UNASSIGNED`, `ISSUE_STATUS_CHANGED` and `ISSUE_DELETED`, off for `ISSUE_EDITED`. The Issue Notification tickets read the switches through this table's module-internal store; nothing sends Issue email yet.

Indexes serve recipient paging (`user_id, created_at DESC, id DESC`), unread count (`user_id` where unread), pending email (`email_due_at` where not emailed) and retention (`created_at`).

The nightly cleanup runs at **03:00 UTC** (`nimbus.notifications.cleanup-cron`, default `0 0 3 * * *`). It deletes rows whose `created_at` is strictly older than 90 days, in batches of at most 1000. The shared `Clock` supplies the cutoff, truncated to database microseconds. Rows exactly at the cutoff remain.

## REST endpoints

All require a Bearer token and a verified User: `401` without authentication and `403` with `code: email_unverified` for an Unverified User. Every query and update is scoped to the caller. Contract: [openapi.yaml](openapi.yaml).

| Endpoint                                          | Result                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notifications?before=<cursor>&limit=20` | `{items, nextCursor}`, newest first by event time then id; `limit` 1–100. Each item has `id`, `type`, `createdAt`, `read`, `snapshot` and `link` (`/settings/security`). `nextCursor` is null at the end. |
| `GET /api/notifications/unread-count`             | `{count}`                                                                                                                                                                                                 |
| `POST /api/notifications/{id}/read`               | `204`, also when already read; `404` when absent or another User's.                                                                                                                                       |
| `POST /api/notifications/read-all`                | `204`, marking only the caller's unread Notifications.                                                                                                                                                    |
| `GET /api/users/me/notification-settings`         | `[{type, email}]` for the five Issue types, in a fixed order: Assigned, Unassigned, Status changed, Edited, Deleted.                                                                                      |
| `PUT /api/users/me/notification-settings/{type}`  | Body `{email}`; `204`. `400` for a Security alert type, an unknown type (types are case-sensitive) or a missing `email`.                                                                                  |

The opaque cursor encodes the last row's time and id, so equal timestamps and new arrivals do not shift later pages. Malformed cursors and limits outside 1–100 give `400`. Read actions never change whether an email is sent.

## Web

The bell appears in all navbar positions. Its badge shows the unread count, capped at `9+`, from a TanStack Query that polls every 30 seconds while the app is visible and refetches when focus returns. The account-scoped query cache is cleared by the existing session lifecycle.

The panel is a popover on larger screens and a full-width bottom sheet on phones. Opening it refreshes the first page. The infinite list groups rows by local day (Today, Yesterday, or date), tints unread rows, and loads older rows near the bottom on scroll; a button offers the same action for keyboard users. Clicking a row marks it read before opening Security. Both read actions invalidate the list and count, and failures stay visible for retry.

The empty state says "an Issue you reported or are assigned to changes". The footer says "Kept for 90 days" and links to Email settings, which opens Settings › Notifications. A row shows its `snapshot.detail`, or the device for a new sign-in, with no location. Surfaces and colors use the shared theme variables.

Settings › Notifications (`/settings/notifications`, design 38e), listed on the Settings overview, shows a row per Issue type with a locked "Always on" in-app column and an email switch. Descriptions: Assigned "Sent right away.", Edited "Several changes in one save count once.". Each switch saves as it changes with an optimistic update; on an error it rolls back and shows a toast. A read-only Security alerts block reads "Always on, in app and email".
