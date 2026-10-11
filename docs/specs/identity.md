# identity

Owns **Users** and sign-in: registration, passwords, access tokens and (later) refresh-token sessions and Linked identities. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). Users are global, not owned by a workspace ([ADR 0001](../adr/0001-global-users-tenancy-deferred.md)).

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
- Public endpoints: `POST /api/auth/register`, `POST /api/auth/login`.
- The API is stateless: no HTTP session, no CSRF tokens (Bearer tokens can't be forged cross-site).
- Responses carry `Cache-Control: no-store`.

## REST endpoints

Contract: [openapi.yaml](openapi.yaml).

| Endpoint                  | Behaviour                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register` | Creates a User and signs them in: `201 {accessToken, user}`. `409` if the email is registered (case-insensitive), `400` with `errors` per field when invalid.                                                                                |
| `POST /api/auth/login`    | Signs in with email (any case) and password: `200 {accessToken, user}`. Wrong password, unknown email and a User without a password all get the same `401` "Invalid email or password". `429` with `Retry-After` while the email is blocked. |
| `GET /api/users/me`       | The signed-in User. `401` (`invalid_token`) if the token's User no longer exists.                                                                                                                                                            |

## Rules

- Email and display name have surrounding whitespace removed before validation.
- Email is unique and stored lower-cased. The unique constraint, not the up-front check, guarantees one User per email when registrations race.
- Password: 8–128 characters, no composition rules, kept exactly as typed. Hashed with Argon2id (stored with an `{argon2}` prefix so the algorithm can change later), outside any database transaction because it is slow. Not bcrypt, because bcrypt only uses the first 72 bytes.
- Display name: required, at most 100 characters, no control characters.

## Rate limits

Counted in memory over a sliding 15-minute window (`nimbus.auth.limit-window`), which is enough while the API runs as one instance. Over a limit, the endpoint answers `429` with `Retry-After` in seconds.

| Limit                                                                                                                                                                   | Default | Setting                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------- |
| Failed sign-ins per email. Further attempts, even with the right password, get `429` until the oldest failure leaves the window. A successful sign-in clears the count. | 5       | `nimbus.auth.failed-sign-ins-per-email` |
| Registration attempts per IP address                                                                                                                                    | 10      | `nimbus.auth.registrations-per-address` |

The IP address is the connection's remote address. Behind a reverse proxy every request would share the proxy's address, so a deployment behind one must enable forwarded headers (`server.forward-headers-strategy`).

## Tables

| Table   | Columns                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users` | `id` (UUID), `email` (unique, lower-case), `display_name`, `password_hash` (null for Google/GitHub-only Users), `avatar_url`, `email_verified` (false for password sign-ups), `created_at` |
