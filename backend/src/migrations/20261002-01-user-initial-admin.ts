import { hashPassword } from '#core/auth/password.js'
import { config } from '#core/config/env.js'
import { logger } from '#core/config/logger.js'
import type { Migration } from '#core/database/migrations.js'
import { roles } from '#modules/role/index.js'
import { accounts } from '#modules/user/index.js'

// A new database gets the built-in Admin role and its first Admin, from INITIAL_ADMIN_EMAIL /
// INITIAL_ADMIN_NAME / INITIAL_ADMIN_PASSWORD. A database that already has an Admin (e.g. the demo
// seed) only gets the role checked. Without the settings it fails, so a new installation never
// starts with nobody able to sign in.
export const initialAdmin: Migration = {
  id: '20261002-01-user-initial-admin',
  description: 'the Admin role and the first Admin',
  async up() {
    await roles.ensureAdminRole()
    if (await accounts.hasActiveAdmin()) return

    const { email, name, password } = config.initialAdmin
    if (!email || !password) {
      throw new Error(
        'The database has no Admin: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (first start only)' +
          (config.isProduction ? '' : ', or run `npm run seed` for the demo data'),
      )
    }
    const admin = await accounts.createAdmin({ name, email }, await hashPassword(password))
    logger.warn(`[migrate] first Admin created: ${admin.id}. Change its password in the app and remove INITIAL_ADMIN_PASSWORD from the environment.`)
  },
}
