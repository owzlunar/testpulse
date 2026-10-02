import type { AppModule } from '#core/module.js'
import { SettingsModel } from './settings.model.js'
import { settingsRouter } from './settings.routes.js'

// Per-user preferences (alerts, export options, layout).
export const settingsModule: AppModule = {
  name: 'settings',
  router: settingsRouter,
  models: [SettingsModel],
}
