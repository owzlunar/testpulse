import type { Seed } from '#core/module.js'
import { DEFAULT_ROLES } from './role.defaults.js'
import { RoleModel } from './role.model.js'
import { roleService } from './role.service.js'

// Demo roles: the default ones, upserted by id (re-running resets them).
export const roleSeed: Seed = {
  name: 'roles',
  async run() {
    await roleService.ensureAdminRole()
    for (const { _id, ...role } of DEFAULT_ROLES) {
      await RoleModel.findOneAndUpdate({ _id }, { $set: { ...role, nameKey: role.name.toLowerCase() } }, { upsert: true })
    }
  },
}
