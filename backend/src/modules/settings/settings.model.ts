import mongoose, { Schema } from 'mongoose'
import type { AppSettings } from '#contract/types.js'

/** one document per user, keyed by the user id */
export interface SettingsDoc extends AppSettings {
  _id: string
}

const settingsSchema = new Schema<SettingsDoc>(
  {
    _id: { type: String, required: true },
    alertOnModification: Boolean,
    alertOnStatusChange: Boolean,
    alertOnExpiry: Boolean,
    expiryDaysThreshold: Number,
    obsidianFrontmatter: Boolean,
    obsidianCallouts: Boolean,
    obsidianWikilinks: Boolean,
    stickyPageHeader: Boolean,
  },
  { timestamps: true, collection: 'user_settings', versionKey: false },
)

export const SettingsModel = mongoose.model<SettingsDoc>('UserSettings', settingsSchema)
