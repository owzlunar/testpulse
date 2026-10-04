import type { ClientSession } from 'mongoose'
import type { Defect } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { DefectCounterModel, DefectModel, type DefectDoc } from './defect.model.js'

const COUNTER = 'defect'

class DefectRepository extends BaseRepository<DefectDoc, Defect> {
  constructor() {
    super(DefectModel, ['createdAt', 'updatedAt'], { createdAt: -1 })
  }

  /** the next BUG-nnn, atomically (two reports at once never share a number) */
  async nextId(): Promise<string> {
    const counter = await DefectCounterModel.findOneAndUpdate({ _id: COUNTER }, { $inc: { seq: 1 } }, { upsert: true, new: true })
    return `BUG-${String(counter.seq).padStart(3, '0')}`
  }

  /** the counter goes on from at least `seq` (seeds, imported defects) */
  async countFrom(seq: number): Promise<void> {
    await DefectCounterModel.updateOne({ _id: COUNTER }, { $max: { seq } }, { upsert: true })
  }

  ofProjects(projectIds: string[]): Promise<Defect[]> {
    return this.find({ projectId: { $in: projectIds } })
  }

  /** fields set to undefined are removed (e.g. the environment of a defect moved off it) */
  async update(id: string, fields: Partial<DefectDoc>): Promise<Defect | null> {
    const entries = Object.entries(fields)
    const unset = entries.filter(([, v]) => v === undefined).map(([k]) => [k, 1])
    const update = {
      $set: Object.fromEntries(entries.filter(([, v]) => v !== undefined)),
      ...(unset.length && { $unset: Object.fromEntries(unset) }),
    }
    return this.toApi(await DefectModel.findOneAndUpdate({ _id: id }, update, { new: true }))
  }

  async addComment(id: string, comment: Defect['comments'][number]): Promise<Defect | null> {
    return this.toApi(await DefectModel.findOneAndUpdate({ _id: id }, { $push: { comments: comment } }, { new: true }))
  }

  /**
   * defects made before environments and causes: a code problem, on the environment whose name matches
   * their free text (others keep only the text); how many changed
   */
  async place(projectId: string, match: (name: string) => { id: string; name: string } | undefined): Promise<number> {
    const { modifiedCount } = await DefectModel.updateMany({ projectId, cause: { $exists: false } }, { $set: { cause: 'code' } })
    const docs = await DefectModel.find(
      { projectId, environmentId: { $exists: false }, environment: { $nin: [null, ''] } },
      { environment: 1 },
    ).lean()
    let placed = 0
    for (const d of docs) {
      const env = match(d.environment ?? '')
      if (!env) continue
      await DefectModel.updateOne({ _id: d._id }, { $set: { environmentId: env.id, environment: env.name } })
      placed++
    }
    return Math.max(modifiedCount, placed)
  }

  deleteOfProject(projectId: string) {
    return DefectModel.deleteMany({ projectId })
  }

  /** follows renumbered case ids (old -> new), through a marked value since ids are often swapped */
  async renameCases(projectId: string, renames: Record<string, string>, session?: ClientSession): Promise<void> {
    const entries = Object.entries(renames)
    for (const [from, to] of entries) {
      await DefectModel.updateMany({ projectId, caseId: from, caseDeleted: { $ne: true } }, { $set: { caseId: `~${to}` } }, { session })
    }
    for (const [, to] of entries) await DefectModel.updateMany({ projectId, caseId: `~${to}` }, { $set: { caseId: to } }, { session })
  }

  /** defects of deleted cases keep the id as history, detached from it */
  detachCases(projectId: string, ids: string[]) {
    return DefectModel.updateMany({ projectId, caseId: { $in: ids } }, { $set: { caseDeleted: true } })
  }

  /** open defects of these (live) cases */
  openOfCases(projectId: string, ids: string[]): Promise<Defect[]> {
    return this.find({ projectId, caseId: { $in: ids }, caseDeleted: { $ne: true }, status: { $nin: ['closed', 'rejected'] } })
  }
}

export const defectRepository = new DefectRepository()
