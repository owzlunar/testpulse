import type { FilterQuery } from 'mongoose'
import type { Requirement } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { RequirementModel, type RequirementDoc } from './requirement.model.js'

class RequirementRepository extends BaseRepository<RequirementDoc, Requirement> {
  constructor() {
    super(RequirementModel, ['code', 'updatedAt'], { code: 1 })
  }

  ofProjects(projectIds: string[]): Promise<Requirement[]> {
    return this.find({ projectId: { $in: projectIds } }, { projectId: 1, code: 1 })
  }

  ofProject(projectId: string): Promise<Requirement[]> {
    return this.find({ projectId }, { code: 1 })
  }

  async update(id: string, fields: Partial<RequirementDoc>): Promise<Requirement | null> {
    return this.toApi(await RequirementModel.findOneAndUpdate({ _id: id }, { $set: fields }, { new: true }))
  }

  async remove(id: string): Promise<void> {
    await RequirementModel.findOneAndDelete({ _id: id })
  }

  deleteOfProject(projectId: string) {
    return RequirementModel.deleteMany({ projectId })
  }

  async search(filter: FilterQuery<RequirementDoc>, limit: number): Promise<{ requirements: Requirement[]; total: number }> {
    const [docs, total] = await Promise.all([
      RequirementModel.find(filter).sort({ projectId: 1, code: 1 }).limit(limit),
      RequirementModel.countDocuments(filter),
    ])
    return { requirements: this.toApiList(docs), total }
  }
}

export const requirementRepository = new RequirementRepository()
