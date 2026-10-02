import type { AppModule } from '#core/module.js'
import { RoleModel } from './role.model.js'
import { roleRouter } from './role.routes.js'
import { roleSeed } from './role.seed.js'
import { roleService } from './role.service.js'

// Role groups and their permissions. Public API for other modules: the read side of roles.
export { ADMIN_ROLE_ID, ALL_PERMISSIONS } from './role.permissions.js'
export const roles = {
  findById: roleService.findById,
}

export const roleModule: AppModule = {
  name: 'role',
  router: roleRouter,
  models: [RoleModel],
  seeds: [roleSeed],
  setup: () => roleService.ensureAdminRole(),
}
