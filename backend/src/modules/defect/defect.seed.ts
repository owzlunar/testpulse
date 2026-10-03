import type { Seed } from '#core/module.js'
import { DefectModel } from './defect.model.js'
import { defectRepository } from './defect.repository.js'
import { SEED_DEFECTS } from './defect.seed-data.js'

// Upserted by id (re-running resets them); new reports are numbered after them.
export const defectSeed: Seed = {
  name: 'defects',
  async run() {
    for (const { id, createdAt, updatedAt, ...defect } of SEED_DEFECTS) {
      await DefectModel.findOneAndUpdate(
        { _id: id },
        { $set: { ...defect, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) } },
        { upsert: true, timestamps: false },
      )
    }
    await defectRepository.countFrom(Math.max(...SEED_DEFECTS.map((d) => Number(d.id.replace(/\D/g, '')))))
  },
}
