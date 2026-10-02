import { setPrincipalResolver } from '#core/auth/principal.js'
import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { UserModel } from './user.model.js'
import { userRepository } from './user.repository.js'
import { userRouter } from './user.routes.js'
import { userSeed } from './user.seed.js'
import { userService } from './user.service.js'

// People who use TestPulse. Public API for other modules: account lookups and changes the auth
// module needs (it owns sign-in, invites and passwords; this module owns the user record).
export { DEMO_PASSWORD } from './user.seed.js'
export { userFieldRules } from './user.validation.js'
export const accounts = {
  findById: userService.findById,
  findByEmail: userService.findByEmail,
  passwordHashOf: userService.passwordHashOf,
  register: userService.register,
  setPassword: userService.setPassword,
  existingIds: (ids: string[]) => userRepository.existingIds(ids),
  hasActiveAdmin: userService.hasActiveAdmin,
  createAdmin: userService.createAdmin,
}

export const userModule: AppModule = {
  name: 'user',
  router: userRouter,
  models: [UserModel],
  seeds: [userSeed],
  setup() {
    setPrincipalResolver(userService.principalOf)
    on('role.deleted', ({ roleId, moveTo, session }) => userService.moveRole(roleId, moveTo, session))
  },
}
