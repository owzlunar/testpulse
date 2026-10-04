import type { ClientSession } from 'mongoose'
import type { RunResult, TestRun } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { RunModel, type RunDoc } from './run.model.js'

/** the live result of a case in a run (a deleted case's result keeps its old id, as history) */
const liveResult = (caseId: string) => ({ caseId, caseDeleted: { $ne: true } })

class RunRepository extends BaseRepository<RunDoc, TestRun> {
  constructor() {
    super(RunModel, ['createdAt'], { createdAt: -1 })
  }

  /** the contract's createdAt is an ISO string (newer-run checks compare them) */
  protected override toApi(doc: { toJSON(): unknown } | null): TestRun | null {
    const run = super.toApi(doc)
    if (run && (run.createdAt as unknown) instanceof Date) run.createdAt = (run.createdAt as unknown as Date).toISOString()
    return run
  }

  protected override toApiList(docs: { toJSON(): unknown }[]): TestRun[] {
    return docs.map((d) => this.toApi(d)!)
  }

  ofProjects(projectIds: string[]): Promise<TestRun[]> {
    return this.find({ projectId: { $in: projectIds } })
  }

  ofProject(projectId: string): Promise<TestRun[]> {
    return this.find({ projectId })
  }

  /** the free-text environments of a project's runs made before runs picked one of the project's */
  async unplacedEnvironmentNames(projectId: string): Promise<string[]> {
    return (await RunModel.distinct('environment', { projectId, environmentId: { $exists: false } })) as string[]
  }

  /** puts each of those runs on the environment `pick` gives for its free text; how many */
  async place(projectId: string, pick: (name: string) => { id: string; name: string }): Promise<number> {
    const docs = await RunModel.find({ projectId, environmentId: { $exists: false } }, { environment: 1 }).lean()
    for (const d of docs) {
      const env = pick(d.environment ?? '')
      await RunModel.updateOne({ _id: d._id }, { $set: { environmentId: env.id, environment: env.name } })
    }
    return docs.length
  }

  async update(id: string, fields: Partial<RunDoc>): Promise<TestRun | null> {
    return this.toApi(await RunModel.findOneAndUpdate({ _id: id }, { $set: fields }, { new: true }))
  }

  /** replaces one case's result (and run fields such as its status) in a single write */
  async setResult(id: string, result: RunResult, fields: Partial<RunDoc> = {}): Promise<TestRun | null> {
    const doc = await RunModel.findOneAndUpdate(
      { _id: id, results: { $elemMatch: liveResult(result.caseId) } },
      { $set: { 'results.$': result, ...fields } },
      { new: true },
    )
    return this.toApi(doc)
  }

  async remove(id: string): Promise<void> {
    await RunModel.findOneAndDelete({ _id: id })
  }

  deleteOfProject(projectId: string) {
    return RunModel.deleteMany({ projectId })
  }

  /** follows renumbered case ids (old -> new); ids are often swapped, so every one goes through a marked value */
  async renameCases(projectId: string, renames: Record<string, string>, session?: ClientSession): Promise<void> {
    const entries = Object.entries(renames)
    for (const [from, to] of entries) {
      await RunModel.updateMany(
        { projectId },
        { $set: { 'results.$[r].caseId': `~${to}` } },
        { arrayFilters: [{ 'r.caseId': from, 'r.caseDeleted': { $ne: true } }], session },
      )
    }
    for (const [, to] of entries) {
      await RunModel.updateMany({ projectId }, { $set: { 'results.$[r].caseId': to } }, { arrayFilters: [{ 'r.caseId': `~${to}` }], session })
    }
  }

  /** results of deleted cases stay in their runs as history, detached from the (reusable) id */
  detachCases(projectId: string, ids: string[]) {
    return RunModel.updateMany({ projectId }, { $set: { 'results.$[r].caseDeleted': true } }, { arrayFilters: [{ 'r.caseId': { $in: ids } }] })
  }

  /** runs with a live result for any of these cases */
  withCases(projectId: string, ids: string[]): Promise<TestRun[]> {
    return this.find({ projectId, results: { $elemMatch: { caseId: { $in: ids }, caseDeleted: { $ne: true } } } })
  }
}

export const runRepository = new RunRepository()
