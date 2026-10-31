# Nimbus

A project management app where teams create projects, issues, boards and sprints, with AI helping to save time: turn meeting notes into issues and catch duplicate issues before they're filed. Admins control access with scoped roles they can change at runtime.

## Tech stack

| Area     | Tools                                                                             |
| -------- | --------------------------------------------------------------------------------- |
| Backend  | Java 21, Spring Boot 4, Spring Modulith, Spring Security, Spring Data JPA, Flyway |
| Database | PostgreSQL 16 + pgvector (Docker)                                                 |
| Frontend | React 19, Vite, React Compiler, Mantine                                           |
| Desktop  | Electron (stretch goal): a thin shell around the web app                          |
| Tooling  | Turborepo + pnpm monorepo, oxlint + oxfmt, GitHub Actions CI                      |

## Prerequisites

- **Node.js 24+**
- **pnpm**: run `corepack enable` once; the version is pinned in `package.json`
- **JDK 21** (e.g. [Temurin](https://adoptium.net)). Gradle is downloaded automatically.
- **Docker Desktop**, for the database and backend tests
- **GitHub CLI** (`gh auth login`), if you use the agent skills to create feature specs and tickets

## Getting started

1. `pnpm install`
2. **Database:** copy `apps/api/.env.example` to `apps/api/.env` and fill in the shared dev database values (ask the team). Never commit `.env`.
   To use a local database instead, skip the `.env` and run `docker compose up -d`.
   **Uploads** (Profile pictures) go to a bucket: with the shared dev database, add the shared R2 bucket's `STORAGE_*` values to `.env` (ask the team); with a local database, `docker compose up -d` also starts MinIO, which the API uses by default.
3. `pnpm dev` to start the API and website.
   It also restarts the API by itself when you change Java code (see below).

| What       | Where                                 |
| ---------- | ------------------------------------- |
| Website    | http://localhost:3000                 |
| API        | http://localhost:8080                 |
| API health | http://localhost:8080/actuator/health |

Backend tests (`pnpm test`) start their own throwaway database with Docker, so Docker Desktop must be running.

The website forwards `/api/*` calls to the API, so the browser only talks to port 3000.

**API auto-restart.** `pnpm dev` also runs `pnpm --filter api dev:watch` (set up in `apps/api/turbo.json`), which is Gradle's `classes --continuous`: it recompiles whenever you save a `.java` file and copies changed resources such as new migrations, and Spring DevTools (development only, not in the deployed jar) sees the change and restarts the API, which is much faster than stopping and starting `pnpm dev`. Changes to `apps/api/.env` are not picked up this way; restart `pnpm dev` for those. Each restart resets in-memory state such as rate-limit counters.

## Desktop app

`pnpm dev:desktop` opens the Electron window on the dev server, so it works like the website. The window loads Nimbus from `NIMBUS_URL` (default `http://localhost:3000`), so once Nimbus is hosted, pointing it there is a setting, not a rebuild.

In the window, Nimbus has its own shell: a Sidebar instead of the navbar, which folds away with its button or Ctrl `\` (⌘ `\` on macOS) and peeks out when you rest the pointer on the button, and a hidden title bar. There is no menu bar on Windows and Linux (the Nimbus icon at the top left opens the menu; macOS has a minimal menu bar); `pnpm dev:desktop` starts it with `--dev`, which adds reload and developer tools (Ctrl R, Ctrl Shift I). "Continue with Google" and "Continue with GitHub" open your default browser and bring you back to the window signed in (ADR 0008). Details: [docs/specs/desktop.md](docs/specs/desktop.md) and ADR 0007.

## Commands

Run from the repo root.

| Command                       | Does                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                    | Start the API and website                                                   |
| `pnpm dev:desktop`            | Same, plus the Electron desktop window                                      |
| `pnpm --filter api dev:watch` | Recompile the API on every save so it restarts (`pnpm dev` already runs it) |
| `pnpm build`                  | Build everything                                                            |
| `pnpm test`                   | Run backend tests (needs Docker)                                            |
| `pnpm lint`                   | Lint with oxlint                                                            |
| `pnpm check-types`            | Type-check the TypeScript code                                              |
| `pnpm format`                 | Format with oxfmt (`pnpm format:check` to only check)                       |
| `docker compose down`         | Stop the database and MinIO (data is kept in Docker volumes)                |

## Repository layout

```
apps/
  api/        Spring Boot modular monolith
  web/        React website
  desktop/    Electron shell
packages/
  ui/                 Shared React components and Mantine theme
  typescript-config/  Shared tsconfig files
docs/
  specs/      How the system works now (module specs, OpenAPI)
  adr/        Architecture decision records
  agents/     Configuration for the agent skills
```

The backend is split into Spring Modulith modules under `apps/api/src/main/java/com/nimbus/api`: `identity`, `access`, `projects`, `issues`, `boards`, `notifications` and `ai`. Modules talk only through each other's public API and domain events; a test fails the build if a module reaches into another's internals.

## How we work

Each feature goes plan → feature spec → tickets → build → PR → review → merge, using agent skills and the **Nimbus Board**. See **[docs/workflow.md](docs/workflow.md)** for the full loop with diagrams, branch and PR rules, and a fast path for small fixes.

Project terms are defined in [GLOSSARY.md](GLOSSARY.md). AI agents read [AGENTS.md](AGENTS.md) for project conventions.
