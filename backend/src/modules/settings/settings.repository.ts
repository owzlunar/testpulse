import type { AppSettings } from '#contract/types.js'
import { SettingsModel } from './settings.model.js'

export const settingsRepository = {
  find: (userId: string): Promise<Partial<AppSettings> | null> => SettingsModel.findById(userId).lean(),
  upsert: (userId: string, settings: AppSettings): Promise<Partial<AppSettings> | null> =>
    SettingsModel.findByIdAndUpdate(userId, { $set: settings }, { upsert: true, new: true }).lean(),
}
