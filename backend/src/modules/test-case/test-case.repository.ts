import type { ClientSession, FilterQuery } from 'mongoose'
import type { TestCase } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { TestCaseModel, type TestCaseDoc } from './test-case.model.js'

/** a case's stored fields, as the service writes them (the API shape plus its list position) */
export type TestCaseData = Omit<TestCase, 'uid' | 'createdAt' | 'updatedAt'> & { position?: number }

const byPosition = { position: 1 } as const
const active = { archivedAt: null }

class TestCaseRepository extends BaseRepository<TestCaseDoc, TestCase> {
  constructor() {
    super(TestCaseModel, ['position', 'updatedAt'], byPosition)
  }

  /** a project's cases in list order (archived included) */
  ofProject(projectId: string, session?: ClientSession): Promise<TestCase[]> {
    return TestCaseModel.find({ projectId })
      .sort(byPosition)
      .session(session ?? null)
      .then((docs) => this.toApiList(docs))
  }

  activeOfProject(projectId: string): Promise<TestCase[]> {
    return this.find({ projectId, ...active })
  }

  findCase(projectId: string, id: string, session?: ClientSession): Promise<TestCase | null> {
    return TestCaseModel.findOne({ projectId, id })
      .session(session ?? null)
      .then((doc) => this.toApi(doc))
  }

  /** highest top-level number and list position in use (archived cases keep theirs) */
  async lastNumbers(projectId: string, session?: ClientSession): Promise<{ numericId: number; position: number }> {
    const [row] = await TestCaseModel.aggregate<{ numericId: number; position: number }>([
      { $match: { projectId } },
      { $group: { _id: null, numericId: { $max: { $cond: [{ $eq: ['$parentId', null] }, '$numericId', 0] } }, position: { $max: '$position' } } },
    ]).session(session ?? null)
    return { numericId: Math.max(row?.numericId ?? 0, 100), position: row?.position ?? 0 }
  }

  /** writes the whole case (by uid); the new revision must already be in `data` */
  async write(uid: string, data: Partial<TestCaseData>, session?: ClientSession): Promise<TestCase> {
    const doc = await TestCaseModel.findOneAndUpdate({ _id: uid }, { $set: data }, { new: true, session })
    return this.toApi(doc)!
  }

  async writeMany(changes: { uid: string; data: Partial<TestCaseData> }[], session?: ClientSession): Promise<TestCase[]> {
    const saved: TestCase[] = []
    for (const c of changes) saved.push(await this.write(c.uid, c.data, session))
    return saved
  }

  /** drops fields (e.g. archivedAt on restore, reviewNeeded when reviewed) */
  async unset(uid: string, fields: (keyof TestCaseDoc)[], session?: ClientSession): Promise<void> {
    await TestCaseModel.updateOne({ _id: uid }, { $unset: Object.fromEntries(fields.map((f) => [f, 1])) }, { session })
  }

  async deleteCases(projectId: string, ids: string[], session?: ClientSession): Promise<void> {
    await TestCaseModel.deleteMany({ projectId, id: { $in: ids } }, { session })
  }

  deleteOfProject(projectId: string) {
    return TestCaseModel.deleteMany({ projectId })
  }

  /**
   * gives cases new ids / numbers / parents / positions at once: the ids first move out of the way
   * (a renumbering often swaps them, and (projectId, id) is unique)
   */
  async renumber(changes: { uid: string; data: Partial<TestCaseData> }[], session: ClientSession): Promise<void> {
    if (!changes.length) return
    await TestCaseModel.bulkWrite(
      changes.map((c) => ({ updateOne: { filter: { _id: c.uid }, update: { $set: { id: `~${c.uid}` } } } })),
      { session },
    )
    await TestCaseModel.bulkWrite(
      changes.map((c) => ({ updateOne: { filter: { _id: c.uid }, update: { $set: c.data } } })),
      { session },
    )
  }

  /** active cases of the projects matching the filter, list order, at most `limit` (and how many there are) */
  async searchActive(projectIds: string[], filter: FilterQuery<TestCaseDoc>, limit: number): Promise<{ cases: TestCase[]; total: number }> {
    const query = { projectId: { $in: projectIds }, ...active, ...filter }
    const [docs, total] = await Promise.all([
      TestCaseModel.find(query).sort({ projectId: 1, position: 1 }).limit(limit),
      TestCaseModel.countDocuments(query),
    ])
    return { cases: this.toApiList(docs), total }
  }

  /** active cases of several projects, only what counting needs */
  async activeForStats(projectIds: string[]): Promise<Pick<TestCase, 'projectId' | 'status' | 'expiryDate'>[]> {
    return TestCaseModel.find({ projectId: { $in: projectIds }, ...active }, { projectId: 1, status: 1, expiryDate: 1 }).lean()
  }

  /** active, unfinished cases with a due date (the due-date alerts) */
  withDueDate(): Promise<TestCase[]> {
    return this.find({ ...active, expiryDate: { $nin: [null, ''] }, status: { $ne: 'passed' } })
  }
}

export const testCaseRepository = new TestCaseRepository()
