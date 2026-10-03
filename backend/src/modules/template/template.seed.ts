import type { Seed } from '#core/module.js'
import { TemplateModel } from './template.model.js'
import { SEED_TEMPLATES } from './template.seed-data.js'

// Upserted by id: re-running resets them.
export const templateSeed: Seed = {
  name: 'test-case-templates',
  async run() {
    for (const { id, ...template } of SEED_TEMPLATES) await TemplateModel.findOneAndUpdate({ _id: id }, { $set: template }, { upsert: true })
  },
}
