# storage

Keeps uploaded files (objects) in a bucket and gives them back by key. It knows nothing about what the files are or who may see them: callers choose the keys, check what they store, and decide who gets an object. `identity` uses it for uploaded Profile pictures; Issue attachments will use it later. Why a bucket, and why Cloudflare R2: [ADR 0006](../adr/0006-uploaded-files-live-in-cloudflare-r2-served-through-the-api.md). Terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Public interface

| Type               | Use                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ObjectStore`      | `store(key, bytes, contentType)` stores an object, replacing any under that key. `read(key)` returns an `Optional<StoredObject>`, empty when there is none. `delete(key)` deletes one; a missing key is not an error.                 |
| `StoredObject`     | `contentType`, `length` and `content`, an `InputStream` straight from the bucket. It is `AutoCloseable`: close it once read (Spring closes a stream it sends as a response body), or the connection to the bucket stays taken.        |
| `StorageException` | Thrown by all three when the bucket can't be reached or refuses the request (wrong keys, missing bucket, timeout). Callers decide whether that fails their request or is only logged (`identity` logs failed deletes and carries on). |

Everything under `storage.internal` is private to the module.

Keys are the caller's. Use a folder per kind of file (`identity` stores under `profile-pictures/`), and make keys unguessable when objects are served without sign-in. The module does not check sizes or types; callers do that before storing.

## Implementation

`S3ObjectStore` talks to the bucket through the S3 API with the AWS SDK for Java 2 (`S3Client`), so R2, MinIO and S3 work the same way. The client uses path-style addresses (the bucket in the path, which MinIO needs and R2 accepts), only the checksums S3 requires (newer SDK defaults add ones some S3-compatible stores reject), and a 20-second limit per call. Nothing is checked at startup: a wrong key or a missing bucket shows up as a `StorageException` on the first call. Blank keys stop the app from starting, with a message saying so.

## Configuration

Set in `apps/api/.env` (documented in `.env.example`); credentials are never tracked. Endpoint, region and bucket default to the MinIO from `docker compose`; the keys have no default, so a missing setting stops the API at startup instead of quietly sending uploads elsewhere. `.env.example` holds the local MinIO's keys.

| Variable             | Setting                     | Meaning                                                                                                   |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `STORAGE_ENDPOINT`   | `nimbus.storage.endpoint`   | The S3 API address. R2: `https://<account id>.r2.cloudflarestorage.com`. Default `http://localhost:9000`. |
| `STORAGE_REGION`     | `nimbus.storage.region`     | `auto` for R2; MinIO accepts any. Default `us-east-1`.                                                    |
| `STORAGE_BUCKET`     | `nimbus.storage.bucket`     | The bucket's name. Default `nimbus`.                                                                      |
| `STORAGE_ACCESS_KEY` | `nimbus.storage.access-key` | Access key id (R2: an API token's access key). Required: the API refuses to start without it.             |
| `STORAGE_SECRET_KEY` | `nimbus.storage.secret-key` | Secret access key. Required, like the access key.                                                         |

One bucket per database, because the rows point at the objects (ADR 0006):

- **Shared dev database**: the shared R2 bucket `nimbus-dev`. Its keys are shared with the team like the database values.
- **Local database**: MinIO from `docker compose up -d` (`nimbus-minio`, API on port 9000, console on 9001, user `nimbus`, password `nimbus-minio`). The `minio-bucket` service creates the `nimbus` bucket and exits. Its data lives in the `minio-data` volume.
- **Tests**: MinIO in a Testcontainers container (`TestcontainersConfiguration`), with the bucket `nimbus-test` created at start.
- **Production**: its own bucket, created at deploy time.

MinIO no longer publishes images on Docker Hub, so `docker compose` and the tests use Chainguard's `chainguard/minio` (and `chainguard/minio-client` to create the bucket), pinned by digest. Only their `latest` tag is free, so updating means pulling it and copying the new digest into `docker-compose.yml` and `TestcontainersConfiguration`.

## Events published

None.

## Tables

None. Objects live in the bucket; the rows that point at them belong to the calling module (`users.uploaded_picture_key` in [identity.md](identity.md)).
