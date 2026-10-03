import type { Requirement } from '#contract/types.js'
import { searchPattern } from '#core/http/search.js'
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

  /** ids whose "CODE: title" contains the text (case-insensitive, literally) */
  async idsMatching(projectIds: string[], text: string): Promise<string[]> {
    const regex = searchPattern(text).source
    const docs = await RequirementModel.find(
      { projectId: { $in: projectIds }, $expr: { $regexMatch: { input: { $concat: ['$code', ': ', '$title'] }, regex, options: 'i' } } },
      { _id: 1 },
    ).lean()
    return docs.map((d) => String(d._id))
  }
}

export const requirementRepository = new RequirementRepository()
