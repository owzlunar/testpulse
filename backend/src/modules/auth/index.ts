import { logger } from '#core/config/logger.js'
import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { InviteModel, RefreshTokenModel } from './auth.model.js'
import { authRouter } from './auth.routes.js'
import { authService } from './auth.service.js'

// Sign-in, sessions (access + rotating refresh tokens), self-registration, invites and passwords.
export const authModule: AppModule = {
  name: 'auth',
  router: authRouter,
  models: [RefreshTokenModel, InviteModel],
  setup() {
    // the user is saved by now: a mail failure must not turn the request into an error (the Admin can resend)
    on('user.invited', ({ user }) =>
      authService.invite(user.id).catch((err: Error) => logger.error(`[auth] invite mail to ${user.id} not sent: ${err.message}`)),
    )
  },
}
