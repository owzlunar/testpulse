# TestPulse

QA test management (Dev <-> QA lifecycle, test runs, defects, UAT documents). Product spec: `PRD.md`.

## Layout
```
testpulse
|--- frontend   Vue 3 + Vuetify app (own CLAUDE.md)
|--- backend    Express 5 + Mongoose API in feature modules (own CLAUDE.md)
|--- PRD.md     product spec, shared by both sides
|--- README.md  how to run and configure the Docker image (Thai)
|--- Dockerfile one image `testpulse`: nginx :8080 (web app, proxies /api and /health) + the API on 127.0.0.1:8081, run by supervisor
|--- docker/    nginx.conf, supervisor.conf, entrypoint.sh (BASE_URL path, preflight checks, DB indexes, migrations, supervisor)
|--- docker-compose.yml  the image with env_file backend/.env + backend/.env.prod (git-ignored), uploads and logs in ./docker-data
```
One git repository (github.com/owzlunar/testpulse). Each side keeps its own `CLAUDE.md` with its stack rules; this file holds what both share.

## Shared rules
- The API contract is `frontend/src/api/contract/*.ts`: one interface per module, every function with a JSDoc line naming its endpoint (e.g. `/** PUT /projects/:projectId/test-cases/:id */`). The backend implements those endpoints with the same request/response shapes (`frontend/src/types`). Change the contract on both sides together.
- Server-side logic the mock currently does (ID generation, renumbering, snapshot building, gatekeeper validation, re-keying references) belongs to the backend once it exists.
- Test case ids restart per project (TC-101 …): anything keyed by a case id must also carry its `projectId`.
- Access control is enforced by the server, not the UI: every mutation checks the signed-in user's role permission and project access (the mock's `assertCan(permission, projectId)` in `frontend/src/api/mock/project.ts`); list endpoints return only accessible projects' data and need the module's view permission. Users without a role get nothing but the dashboard and settings. Only the built-in Admin role manages users, roles, teams and projects.
- Stale changes: a test case has a stable `uid` (its `id` changes when the list is renumbered) and a `rev` (+1 on every write). Changes to a case carry the `{uid, rev}` the client saw; the server answers 409 with `code: 'stale'` if the case moved on (see `assertFresh`), and the client reloads. Reorders carry the uid of every id.
- Project access: a project lists `teamIds`; only members of those teams (with a role) may open it, a project without teams is open to every role, Admins open everything.
- Notifications have an audience (`to`: user ids and / or disciplines; none = everyone who can open the project, minus the sender) and per-person `readBy` / `hiddenFor`; `notificationIsFor` (frontend/src/domain/notification.ts) is the rule. The backend creates them in the same request as the change.
- The app may be served under a sub path (`BASE_URL`, e.g. https://mydomain/testpulse): the frontend uses relative URLs that resolve against `<base href>` (never a leading `/` for files or `window.location`), the backend gives public paths from `config.publicPath` / `publicApiPath`.
- No emoji in the UI (PRD). Emoji are only allowed inside the exported Obsidian Markdown.
- UI text is Thai; code, identifiers and comments are English.

## Workflow
- Work one page or component group per commit. A contract change commits both sides (frontend types + backend `npm run contract:sync`) together.
- CI (`.github/workflows`) runs each side's checks when its folder changes; the backend's also when `frontend/src/types` does.
- When unsure whether a change belongs to the frontend, the backend or the contract, ask.
