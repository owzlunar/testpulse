import type { TestCaseTemplate } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { TemplateModel, type TemplateDoc } from './template.model.js'

class TemplateRepository extends BaseRepository<TemplateDoc, TestCaseTemplate> {
  constructor() {
    // most used first
    super(TemplateModel, ['usageCount', 'name'], { usageCount: -1, name: 1 })
  }

  async countUse(id: string): Promise<void> {
    await TemplateModel.updateOne({ _id: id }, { $inc: { usageCount: 1 } })
  }

  /** inserts the template unless one with this id exists; true when it was added */
  async ensure(id: string, fields: Omit<TemplateDoc, '_id'>): Promise<boolean> {
    const res = await TemplateModel.updateOne({ _id: id }, { $setOnInsert: fields }, { upsert: true })
    return res.upsertedCount > 0
  }

  async remove(id: string): Promise<void> {
    await TemplateModel.findOneAndDelete({ _id: id })
  }
}

export const templateRepository = new TemplateRepository()
