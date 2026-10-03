import type { AppModule } from '#core/module.js'
import { SettingsModel } from './settings.model.js'
import { settingsRouter } from './settings.routes.js'
import { settingsService } from './settings.service.js'

// Per-user preferences (alerts, export options, layout). Public API: a user's settings (e.g. which
// notifications they want).
export const userSettings = {
  get: settingsService.get,
}

export const settingsModule: AppModule = {
  name: 'settings',
  router: settingsRouter,
  models: [SettingsModel],
}
