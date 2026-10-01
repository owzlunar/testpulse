# TestPulse frontend (Fox theme)

Shared product rules: `../CLAUDE.md`. Product spec: `../PRD.md`.

Stack: Vue 3, Vite, Vuetify 3.5.9 (pinned exactly, no `^`: same version as `../../fox`, whose look `main.scss` is tuned to; check the Vuetify 3.5 docs before using a newer API), FullCalendar 6 (all `@fullcalendar/*` packages must stay on major 6).
Design reference: Fox admin dashboard (`../../fox`, light + dark, blue primary). Font: Noto Sans Thai.

## Theme source of truth

- Colors, component defaults, icon sets: `src/plugins/vuetify.ts` (adds `caution` = orange for Blocked / High / churn)
- Vuetify SASS variables: `src/styles/settings.scss`
- Global overrides: `src/styles/main.scss`
- Calendar: `src/styles/fullcalendar.scss`

## Rules

1. Never hardcode colors (no hex, rgb, or named colors) in components or styles. Use theme colors: `color="primary"`, `bg-surface`, `text-muted`, or `rgb(var(--v-theme-primary))` in CSS. If a new color is needed, add it to the theme first.
2. Change how a Vuetify component looks by editing `defaults` in `vuetify.ts` before adding per-page props or CSS.
3. Do not override Vuetify internals with `!important` or `:deep()` inside a page. Put shared overrides in `main.scss`.
4. Typography: use `text-h1`..`text-h6`, `text-subtitle-1/2`, `text-body-1/2`, `text-caption`. Do not set `font-size` or `font-family` ad hoc.
5. Buttons: use `<v-btn color="primary">` for primary actions. Do not restyle them per page.
6. Cards: `<v-card>` only, no custom shadows or radii. Radius and shadow come from `--fox-radius-card` and `--fox-shadow-card`.
7. Icons: prefer Tabler (`tabler:name`), then MDI (`mdi-name`), FontAwesome only if neither has it.
8. Forms: label above the field using `<label class="fox-label">`, fields use the defaults (outlined, comfortable).
9. Sidebar: `<v-navigation-drawer class="fox-nav">`.
10. Calendar events use `tone` (`primary|secondary|info|success|warning|caution|error`), not custom colors.
11. Status / priority / role / project-status / milestone / audit-action colors and icons come from the `Option` lists in `services/*.service.ts` (`statusOf`, `priorityOf`, `roleOf`, ...). Never write a `switch (status)` color map in a component.
12. Gate actions by permission, never by role name: `auth.can('module.action')` (`useTestCasePermissions()` for test-case actions), `permission` / `adminOnly` on items in `router/navigation.ts`. Permission keys and their labels live in `PERMISSION_GROUPS` (`role.service.ts`); managing users, roles, teams and projects is `auth.isAdmin`. People pickers use the role's discipline (`auth.usersIn('qa' | 'dev')`).

## Structures

src
|--- assets  
|--- components
|--- composables
|--- layouts
|--- plugins <-- vuetify
|--- router <-- vue-router
|--- services
|--- stores <-- pinia
|--- styles
|--- types
|--- utils  
|--- views

## Conventions

- TypeScript everywhere. Components use `<script setup lang="ts">` with type-based `defineProps` / `defineEmits`. Shared types go in `src/types`.
- Services: `xxx.service.ts` (e.g. `test-case.service.ts`). Stores: `xxx.store.ts` (Pinia setup stores, e.g. `calendar.store.ts`). Multi-word names are kebab-case.
- Components use stores directly (`useProjectStore()` + `storeToRefs`); no thin wrapper composables.
- Generic theme components: `components/ui/Fox*.vue`. Domain components: `components/<module>/<Domain>*.vue` (e.g. `test-cases/TestCaseDialog.vue`).
- Long list pages use `<FoxPageHeader sticky>`: it sticks under the app bar (`--fox-appbar-height`) and turns compact (title `text-h5`, small buttons via `v-defaults-provider`); users can turn it off in Settings. Don't make page content its own scroll container.
- Views: no `View`/`Page` suffix, grouped by module folder: `views/auth/Login.vue`. A module's first page is `Index.vue` (`views/test-cases/Index.vue`).
- `npm run build` runs `vue-tsc` first; it must pass.

## Mock API (no backend yet)

- `services/*.service.ts` **is the API contract**. Every async function there goes through `respond()` in `services/http.ts` (latency + deep copy) and has a JSDoc line naming its endpoint, e.g. `/** PUT /projects/:projectId/test-cases/:id */`. To connect the backend, replace the function body with a `fetch`; stores and pages don't change.
- `services/storage.service.ts` is the mock database (LocalStorage). Only services touch it. Server-side logic (snapshot building, ID generation, gatekeeper validation) lives in the service too, as the backend will do it. Sync helpers named "server-side" (e.g. `renameRunCases`) are part of that logic, not endpoints.
- One-off fixes to stored demo data go through `migrateOnce()`; never re-apply them on every load.
- Permissions are checked in the service too: start every mutation with `assertCan(key | keys | 'admin', projectId)`, filter list endpoints with `sessionCan(view key)` + `inAccessibleProjects()`. The UI checks (`auth.can`, router `meta.permission`) only hide what the server would refuse. The signed-in user is `sessionUser()`; switching user reloads the app (`auth.switchUser`).
- Services import each other (e.g. role ↔ project ↔ user): use other services' exports inside functions only, never in top-level constants.
- Business rules live in the service, not the store: case versioning / pass invalidation / churn (`applyCasePatch`), id assignment (`createTestCases`), run verdict -> case status (`saveResult` + `caseSyncBlock`). Mutations take an `Actor` (the backend reads it from the session). Stores call the endpoint, then update local state and record audit / alerts from the result (`testCaseStore.applyUpdate`).
- Stores: shell data is loaded once by `app.store.bootstrap()`; module data (requirements, runs, defects, documents) is loaded lazily with `ensureLoaded()` and pages show `FoxPageSkeleton` until `loaded`.
- Mutations are `async` and throw `ApiError`. Call them through `useAsyncAction()` (`busy` for button/dialog loading, errors go to the global toast in `App.vue`).
- Dialogs never close themselves after save: they emit `save` and take a `loading` prop; the page closes them on success. `watch(open, …)` in dialogs uses `{ immediate: true }` (deep links open them on mount), so helpers used inside must be declared before the watcher or be `function` declarations.
- Test case ids restart per project (TC-101…): look cases up with `getById(id, projectId)`. Reordering renumbers ids; the service re-keys runs, defects, notifications and audit entries.
- Removing a case means archiving it (`archivedAt`): `casesOf` / `activeCases` exclude archived cases (lists, stats, coverage, new runs, documents); `getById` still finds them (read-only). Permanent delete is only allowed from the archive and detaches references. Confirm both with `TestCaseRemoveDialog` (shows the impact).
- A case's requirement is its linked `requirementIds`; show it with `requirementStore.textFor(tc)`. The free-text `requirement` is an optional note (required only when nothing is linked).
- Changing what a requirement says (title, description, acceptance criteria) or deleting it flags its active linked cases (`reviewNeeded`); a spec edit or "ทบทวนแล้ว" (`markReviewed`) clears it. Each new version keeps a spec `snapshot` (no images); compare with `specDiff`, restore with `restoreVersion`.
- Images: always pass uploads through `utils/image.ts` `compressImage()` (paste / drop / file).

## Exceptions to the colour rule

- Exported files (`export.service.ts`: Obsidian Markdown, Word `.doc`) carry their own fixed styles. App UI never does.
- `DocumentPaper.vue` renders inside `class="v-theme--light"` so a document always looks like paper, even in dark mode.

## Workflow

- Before changing a page, list the hardcoded colors, inline styles and duplicated components in it and propose the fix.
- Run `npm run build` after each group, then commit it.
- When unsure whether a style belongs to the theme or the page, ask.
