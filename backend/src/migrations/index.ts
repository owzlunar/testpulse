import type { Migration } from '#core/database/migrations.js'
import { initialAdmin } from './20261002-01-user-initial-admin.js'

// Every migration, in the order they run (ids sort the same way). Add new ones at the end.
export const migrations: Migration[] = [initialAdmin]
