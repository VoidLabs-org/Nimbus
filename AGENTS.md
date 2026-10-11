<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Nimbus

Project management app (projects, issues, boards, sprints) with AI features. Team of 3.

## Layout

- `apps/api`: Spring Boot modular monolith (Java 21, Gradle, Spring Modulith, Flyway, PostgreSQL)
- `apps/web`: React + Vite + React Compiler + Mantine
- `apps/desktop`: thin Electron shell around `apps/web` (stretch goal)
- `packages/ui`: shared React components and the Mantine theme
- `docs/specs`, `docs/adr`: living specs and decision records

## Commands

- `docker compose up -d`: Postgres + pgvector on port 5433
- `pnpm dev`: API (8080) + web (3000). `pnpm dev:desktop` also opens Electron.
- `pnpm build`, `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm format`

## Conventions

- Backend modules talk only through public APIs and domain events, never each other's internals.
- Flyway owns the schema: every DB change is a new migration in `apps/api/src/main/resources/db/migration`.
- REST endpoints live under `/api` (the Vite dev server proxies `/api` to Spring Boot).
- Permissions are enforced server-side; the UI only hides what a user can't use.
- Lint with oxlint, format with oxfmt. No ESLint or Prettier.

## Specs and tickets

- Plans for a change (feature specs, tickets) are GitHub Issues.
- `docs/specs/` describes how the system works now. When a change touches a module's public API, events, tables or REST endpoints, update its file in `docs/specs/` in the same PR.
- Record hard-to-reverse decisions in `docs/adr/`.

## Agent skills

### Issue tracker

Issues and specs are GitHub Issues on VoidLabs-org/Nimbus, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
