# identity

Owns **Users** and sign-in: registration, passwords, access tokens, refresh-token sessions and (later) Linked identities. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). Users are global, not owned by a workspace ([ADR 0001](../adr/0001-global-users-tenancy-deferred.md)).

## Public interface

| Type          | Use                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CurrentUser` | Inject it and call `id()` for the signed-in User's id (UUID) in a request. Outside an authenticated request it throws `AuthenticationCredentialsNotFoundException`, which becomes a `401`. |

Everything under `identity.internal` is private to the module.

## Events published

None yet.

## Authentication

- Every request needs a valid access token in `Authorization: Bearer <token>`, except the public endpoints below. Requests without one get `401`.
- Access token: HS256 JWT, valid 15 minutes, `sub` = User id. Signed with `JWT_SECRET` from `apps/api/.env` (base64, at least 32 bytes). The app refuses to start without it.
- Public endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`.
- The API is stateless: no HTTP session, no CSRF tokens (Bearer tokens can't be forged cross-site).
- Responses carry `Cache-Control: no-store`.

## Sessions and refresh tokens

- Register and login start a **session** (a refresh-token family) for that browser and set its first refresh token in a cookie: `refresh_token`, `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, `Max-Age` until the token expires. The refresh token never appears in a response body.
- Refresh tokens are 256 random bits (base64url), stored only as SHA-256 hashes.
- Each refresh token works once. `POST /api/auth/refresh` marks it used and sets a new one in the same session (rotation).
- Presenting a used token means it was copied: the whole session is revoked, so neither copy works any more. Other sessions of the same User are not affected.
- Expiry: a token expires 30 days after it was issued (`nimbus.auth.session-idle-timeout`), so a session lives as long as it is used at least every 30 days, but never more than 90 days after sign-in (`nimbus.auth.session-max-age`).
- Sign-out revokes the session (`sessions.revoked_at`), so every token of it stops working, then clears the cookie. Access tokens already issued stay valid until they expire (up to 15 minutes); they are not denylisted.
- A `401` from `/refresh` also clears the cookie (`Max-Age=0`), so the browser stops sending a dead token.
- The cookie is the only credential for `/refresh`, so it also requires `X-Requested-With: nimbus` (`403` without it). Cross-site forms can't set that header.
- Known trade-off: two refreshes sent at once with the same cookie (e.g. several tabs restored together) count as reuse and end the session. The web client sends one refresh at a time per tab, and only a `401` from `/refresh` sends the User to sign in (a `429` or an outage doesn't).
- Expired and revoked rows are not cleaned up yet.

## REST endpoints

Contract: [openapi.yaml](openapi.yaml).

| Endpoint                  | Behaviour                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/auth/register` | Creates a User and signs them in: `201 {accessToken, user}`. `409` if the email is registered (case-insensitive), `400` with `errors` per field when invalid.                                                                                                                                          |
| `POST /api/auth/login`    | Signs in with email (any case) and password: `200 {accessToken, user}`. Wrong password, unknown email and a User without a password all get the same `401` "Invalid email or password". `429` with `Retry-After` while the email is blocked.                                                           |
| `POST /api/auth/refresh`  | Needs the refresh cookie and `X-Requested-With: nimbus`. Rotates the cookie: `200 {accessToken, user}`. `401` when the cookie is missing, unknown, expired, revoked or already used (the last also revokes its session). `403` without the header. `429` over the per-IP limit.                        |
| `POST /api/auth/logout`   | Needs `X-Requested-With: nimbus` (`403` without it). Ends the session of the refresh cookie's token, even a rotated one, and clears the cookie: `204` with `Cache-Control: no-store`. Other sessions of the User keep working. Also `204` with no cookie, an unknown cookie or a session already over. |
| `GET /api/users/me`       | The signed-in User. `401` (`invalid_token`) if the token's User no longer exists.                                                                                                                                                                                                                      |

## Rules

- Email and display name have surrounding whitespace removed before validation.
- Email is unique and stored lower-cased. The unique constraint, not the up-front check, guarantees one User per email when registrations race.
- Password: 8–128 characters, no composition rules, kept exactly as typed. Hashed with Argon2id (stored with an `{argon2}` prefix so the algorithm can change later), outside any database transaction because it is slow. Not bcrypt, because bcrypt only uses the first 72 bytes.
- Display name: required, at most 100 characters, no control characters.

## Rate limits

Counted in memory over a sliding 15-minute window (`nimbus.auth.limit-window`), which is enough while the API runs as one instance. Over a limit, the endpoint answers `429` with `Retry-After` in seconds.

| Limit                                                                                                                                                                                                                                                                                             | Default | Setting                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------- |
| Failed sign-ins per email. Further attempts, even with the right password, get `429` until the oldest failure leaves the window. A successful sign-in doesn't count, but doesn't erase earlier failures either. Known trade-off: anyone who knows an email can keep it locked out (spec #1, Q19). | 5       | `nimbus.auth.failed-sign-ins-per-email` |
| Failed sign-ins per IP address, across all emails (stops one client spraying guesses over many emails)                                                                                                                                                                                            | 20      | `nimbus.auth.sign-ins-per-address`      |
| Registration attempts per IP address                                                                                                                                                                                                                                                              | 10      | `nimbus.auth.registrations-per-address` |
| Failed refreshes per IP address (coarse: refresh tokens can't be guessed; this only stops one client hammering the endpoint). Successful refreshes and requests without a cookie (signed-out page loads) don't count, because everyone behind one office network shares an address.               | 60      | `nimbus.auth.refreshes-per-address`     |

Attempts are counted before the password check, so parallel requests can't race past a limit.

The IP address comes from `X-Forwarded-For` only when the request arrives from a trusted proxy (`server.forward-headers-strategy=native`; Tomcat trusts private and loopback addresses by default). Otherwise it is the connection's address, so internet clients can't fake it. A proxy with a public address must be added to `server.tomcat.remoteip.internal-proxies`, or every client would share its limit.

## Tables

| Table            | Columns                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | `id` (UUID), `email` (unique, lower-case), `display_name`, `password_hash` (null for Google/GitHub-only Users), `avatar_url`, `email_verified` (false for password sign-ups), `created_at`                                                              |
| `sessions`       | `id` (UUID), `user_id` (→ `users`, cascade delete), `started_at`, `expires_at` (absolute cap, sign-in + 90 days), `revoked_at` (set when the session ends early, e.g. on token reuse)                                                                   |
| `refresh_tokens` | `id` (UUID), `session_id` (→ `sessions`, cascade delete), `token_hash` (unique SHA-256 hex), `issued_at`, `expires_at` (issue + 30 days, capped at the session's `expires_at`), `used_at` (set when exchanged; presenting it again revokes the session) |
