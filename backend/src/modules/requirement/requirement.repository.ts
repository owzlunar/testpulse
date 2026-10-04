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

  /** fields set to undefined are removed (e.g. the TOR clause of a requirement that is no longer from the TOR) */
  async update(id: string, fields: Partial<RequirementDoc>): Promise<Requirement | null> {
    const entries = Object.entries(fields)
    const unset = entries.filter(([, v]) => v === undefined).map(([k]) => [k, 1])
    const update = {
      $set: Object.fromEntries(entries.filter(([, v]) => v !== undefined)),
      ...(unset.length && { $unset: Object.fromEntries(unset) }),
    }
    return this.toApi(await RequirementModel.findOneAndUpdate({ _id: id }, update, { new: true }))
  }

  async remove(id: string): Promise<void> {
    await RequirementModel.findOneAndDelete({ _id: id })
  }

  /** requirements stored before they had an origin become additional ones (no TOR clause); how many */
  async markOriginless(): Promise<number> {
    const { modifiedCount } = await RequirementModel.updateMany({ origin: { $exists: false } }, { $set: { origin: 'additional' } })
    return modifiedCount
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
