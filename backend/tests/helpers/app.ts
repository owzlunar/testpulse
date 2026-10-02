import type { Express } from 'express'
import request from 'supertest'
import { appModules } from '../../src/app-modules.js'
import { createApp } from '#core/app.js'
import { signAccessToken } from '#core/auth/tokens.js'
import { config } from '#core/config/env.js'
import type { AppModule } from '#core/module.js'

// The demo data (src/modules/*/*.seed.ts): users and their roles
//   user-admin  Admin            user-qa-1  QA Lead (team-payment)     user-qa-2  QA Tester (team-ecommerce)
//   user-dev-1  Developer (team-payment)    user-dev-2 Developer (both teams)
// Projects: proj-1 (team-payment) · proj-2 (team-ecommerce) · proj-3 (no team: every role)

export const api = (path: string) => `${config.basePath}${path}`

export async function buildApp(modules: AppModule[] = appModules): Promise<Express> {
  return createApp({ modules })
}

/** runs every module's seeds (the demo data) */
export async function seedDemo(modules: AppModule[] = appModules): Promise<void> {
  for (const module of modules) for (const seed of module.seeds ?? []) await seed.run()
}

export const bearer = (userId: string) => `Bearer ${signAccessToken(userId).token}`

/** supertest agent with helpers that send the signed-in user's token */
export function client(app: Express) {
  const as = (userId?: string) => {
    const auth = <T extends request.Test>(t: T) => (userId ? t.set('Authorization', bearer(userId)) : t)
    return {
      get: (path: string) => auth(request(app).get(api(path))),
      post: (path: string) => auth(request(app).post(api(path))),
      put: (path: string) => auth(request(app).put(api(path))),
      patch: (path: string) => auth(request(app).patch(api(path))),
      delete: (path: string) => auth(request(app).delete(api(path))),
    }
  }
  return { as, anonymous: as() }
}
