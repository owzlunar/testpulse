import type { Seed } from '#core/module.js'
import { RequirementModel } from './requirement.model.js'
import { SEED_REQUIREMENTS } from './requirement.seed-data.js'

// Upserted by id: re-running resets them.
export const requirementSeed: Seed = {
  name: 'requirements',
  async run() {
    for (const { id, createdAt, updatedAt, ...requirement } of SEED_REQUIREMENTS) {
      await RequirementModel.findOneAndUpdate(
        { _id: id },
        { $set: { ...requirement, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) } },
        { upsert: true, timestamps: false },
      )
    }
  },
}
