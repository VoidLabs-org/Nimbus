# Uploaded files live in Cloudflare R2 and are served through the API

Profile pictures are the first files Users upload, and Issue attachments will follow. Nimbus keeps them in a Cloudflare R2 bucket, reached only through a `storage` module that speaks the S3 API, rather than in PostgreSQL or on the server's disk. R2 has no egress fees and a free tier that covers a team our size, and because the code only knows the S3 API, MinIO stands in for it in tests and with a local database, and S3 or another S3-compatible store could replace it with a configuration change.

- **Served through the API for now.** Nimbus has no domain yet, and R2's `r2.dev` address is rate-limited and meant for development, so `GET /api/profile-pictures/{key}` streams each file from the bucket. Each upload gets a new random key, so responses can be cached for a year and need no sign-in (an `<img>` tag can't send the access token). Once a domain exists, the bucket can be served from it directly; the address the API hands out comes from configuration.
- **One bucket per database.** Files and the rows that point at them must stay together: the shared dev database uses the shared `nimbus-dev` bucket, a local database uses MinIO from `docker compose`, tests use MinIO through Testcontainers, and production gets its own bucket. Pointing a database at the wrong bucket shows broken pictures, not someone else's.
- **Provider pictures are not copied.** Pictures from Google and GitHub stay at their URLs; only uploads go into the bucket.

## Considered Options

- **PostgreSQL (`bytea`).** No new service, but every picture view would load the database, backups grow with every upload, and attachments would make it worse.
- **The server's disk.** Simple, but lost on redeploy and not shared between instances.
- **Presigned uploads straight to R2.** Less load on the API, but the API could no longer check, crop and re-encode an image before it is stored.
