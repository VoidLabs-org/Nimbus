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
3. `pnpm dev` to start the API and website.
   To have the API restart by itself when you change Java code, also run `pnpm --filter api dev:watch` in a second terminal (see below).

| What       | Where                                 |
| ---------- | ------------------------------------- |
| Website    | http://localhost:3000                 |
| API        | http://localhost:8080                 |
| API health | http://localhost:8080/actuator/health |

Backend tests (`pnpm test`) start their own throwaway database with Docker, so Docker Desktop must be running.

The website forwards `/api/*` calls to the API, so the browser only talks to port 3000.

**API auto-restart.** `pnpm dev` starts the API once and does not watch your Java files. `pnpm --filter api dev:watch` runs Gradle's `compileJava --continuous`: it recompiles whenever you save a `.java` file, and Spring DevTools (development only, not in the deployed jar) sees the new classes and restarts the API, which is much faster than stopping and starting `pnpm dev`. Leave it running in a second terminal. Changes to `apps/api/.env` are not picked up this way; restart `pnpm dev` for those. Each restart resets in-memory state such as rate-limit counters.

## Commands

Run from the repo root.

| Command                       | Does                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                    | Start the API and website                                               |
| `pnpm dev:desktop`            | Same, plus the Electron desktop window                                  |
| `pnpm --filter api dev:watch` | Recompile the API on every save so it restarts (run next to `pnpm dev`) |
| `pnpm build`                  | Build everything                                                        |
| `pnpm test`                   | Run backend tests (needs Docker)                                        |
| `pnpm lint`                   | Lint with oxlint                                                        |
| `pnpm check-types`            | Type-check the TypeScript code                                          |
| `pnpm format`                 | Format with oxfmt (`pnpm format:check` to only check)                   |
| `docker compose down`         | Stop the database (data is kept in a Docker volume)                     |

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
