import type { Migration } from '#core/database/migrations.js'
import { initialAdmin } from './20261002-01-user-initial-admin.js'
import { builtInTemplates } from './20261003-01-template-built-ins.js'
import { defaultRoles } from './20261004-01-role-defaults.js'
import { requirementOrigin } from './20261005-01-requirement-origin.js'
import { projectEnvironments } from './20261005-02-project-environments.js'
import { opsRole } from './20261005-03-role-ops.js'

// Every migration, in the order they run (ids sort the same way). Add new ones at the end.
export const migrations: Migration[] = [initialAdmin, builtInTemplates, defaultRoles, requirementOrigin, projectEnvironments, opsRole]
