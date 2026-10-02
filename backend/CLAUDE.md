# TestPulse backend

Shared product rules: `../CLAUDE.md`. Product spec: `../PRD.md`. Setup and scripts: `README.md`.

Stack: Node 22, TypeScript (ESM, `NodeNext`), Express 5, Mongoose 8 on a MongoDB 6 replica set, Joi, Vitest + supertest + mongodb-memory-server. Modelled on the waf-lab framework (`/Users/worldinfinity/Desktop/ba2/doc/waf-lab/mongodb`), restructured into feature modules as its IMPROVEMENTS.md §19.1 proposes.

## Layout

```
src
|--- core          infrastructure every module uses; never imports a module
|--- modules/<m>   one feature each: model, repository, service, validation, controller, routes, seed, index.ts, __tests__
|--- contract      types.ts: generated copy of frontend/src/types (npm run contract:sync), never edited here
|--- app-modules.ts  the modules this API runs, in start-up order
|--- index.ts      composition root (starts the server)
|--- migrations    data migrations, listed in order in index.ts (core/database/migrations.ts runs them; the first one creates the first Admin from INITIAL_ADMIN_*)
|--- cli           seed, db-indexes, migrate, preflight, rotate-keys: built into dist/cli, run with node in the image
scripts            dev-only tools: make:module, contract, env:init
tests              global setup (in-memory replica set), helpers, cross-module tests (access matrix)
```

## Rules

1. The API contract is `frontend/src/services/*.service.ts` (endpoint in each JSDoc) and `frontend/src/types`. Routes spell out the same paths; responses carry the contract's types inside `{ status: true, data }`. Errors are `{ status: false, message (Thai), code?, errors?, requestId }`. Change the contract in the frontend first, then `npm run contract:sync`.
2. Boundaries (ESLint enforces them): core never imports `#modules/*`; a module imports another only through its `index.ts` (export there only what others may use); controllers never import repositories or models; services never import models (types excepted). Modules talk through the event bus (`#core/events/event-bus.js`, declare events with `declare module`) when the dependency would go the wrong way.
3. Every route declares its access policy where it is defined: `authenticate`, then `requireRole` / `requirePermission(key)` / `requireAdmin`. Project access (team membership) is checked in the service with `projectAccess.assert` / `accessibleIds` from the project module. List endpoints return only data of projects the user may open. Users without a role get nothing but `/auth/me`, `/me/settings` and the user / role lists.
4. Validate every input with Joi (`validate({ params, query, body })`): unknown body fields are stripped, so a client never sets server-owned fields (ids, `builtIn`, `caseStats`, timestamps, status).
5. Repositories extend `BaseRepository` and return API-shaped objects (`toJSON`: `id`, no private fields). Write through `create` / `updateById` / `deleteById` (or `doc.save()`) so the encryption and audit plugins see the change; `updateMany` / `insertMany` / `bulkWrite` bypass them (record audit entries yourself with `recordAudit`).
6. Ids are strings made by the server (`stringId('proj')` → `proj-…`), like the web app's. Test case ids restart per project: anything keyed by a case id also carries its `projectId`.
7. Personal data (emails) is `encrypted: true` with a `blindIndex` for lookups; never log it (the logger redacts known keys; don't put PII in URLs).
8. Thai for messages a user sees (`ApiError` messages, mail); English for code, comments, logs.
9. Secrets come only from the environment and fail fast when missing; no fallback keys. Tests make their own (`tests/setup-env.ts`) and never read `.env`.

## Conventions

- A module = `src/modules/<name>/` with `<name>.model.ts`, `.repository.ts`, `.service.ts`, `.validation.ts`, `.controller.ts`, `.routes.ts`, optional `.seed.ts`, `index.ts` (the `AppModule` + public API) and `__tests__/`. Start one with `npm run make:module -- <name>`, then add it to `src/app-modules.ts`.
- Imports: `#core/...`, `#modules/<name>/index.js`, `#contract/types.js` (package.json "imports"; the `source` condition points them at `src/` for tsx / Vitest / tsc); relative only inside a module. Always with the `.js` extension.
- Express 5 forwards rejected promises: controllers are plain `async` functions, no try/catch wrappers.
- Server-side logic the web app's mock does today (id generation, renumbering, snapshots, gatekeeper validation, re-keying references, notification audiences) moves into the module's service, with the same rules and messages.
- Data that must change once per database (existing records, bootstrap data) goes in a migration: `src/migrations/<yyyymmdd>-<nn>-<module>-<what>.ts`, added at the end of `src/migrations/index.ts`; no down migrations. Indexes are not migrations (`db:indexes` builds them from the schemas).
- Tests: HTTP tests per module in `__tests__` against a real MongoDB (the database in `.env.test`, else in-memory) (`useTestDatabase()`, `buildApp()`, `client(app).as(userId)`, `seedDemo()`); add 401 / 403 cases to `tests/integration/access-matrix.test.ts` lists when a route is public or Admin-only.

## Workflow

- Before committing: `npm run check` (contract, types, lint, format, tests) and `npm run build`.
- One module (or one core concern) per commit, conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- When unsure whether a change belongs to the backend, the frontend or the contract, ask.
