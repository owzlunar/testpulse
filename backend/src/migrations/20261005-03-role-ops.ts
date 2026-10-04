import { logger } from '#core/config/logger.js'
import type { Migration } from '#core/database/migrations.js'
import { roles } from '#modules/role/index.js'

// The Server/Infra role (discipline ops: the team that runs customers' servers gets server problems
// instead of Dev), unless an Admin already has a role with its id or name.
export const opsRole: Migration = {
  id: '20261005-03-role-ops',
  description: 'the Server/Infra role',
  async up() {
    const added = await roles.ensureDefaultRoles(['role-ops'])
    if (added.length) logger.info(`[migrate] default roles added: ${added.join(', ')}`)
  },
}
