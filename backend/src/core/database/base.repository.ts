import type { ClientSession, Model, FilterQuery, UpdateQuery } from 'mongoose'
import { config } from '../config/env.js'

// Data access every repository shares. Repositories return API-shaped plain objects (`toJSON()`:
// id instead of _id, no private fields); services never see Mongoose documents.
// Writes go through hooks-aware methods (save / findOneAndUpdate / findOneAndDelete) so the
// encryption and audit plugins see every change.

export interface PageOptions {
  page?: number
  limit?: number
  /** "field:asc" | "field:desc"; only fields in the repository's sortable list are honoured */
  sort?: string
}

export interface Page<T> {
  items: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

type Sort = Record<string, 1 | -1>

export class BaseRepository<TDoc, TApi = TDoc> {
  constructor(
    protected readonly model: Model<TDoc>,
    /** fields `paginate` may sort by (indexed ones) */
    protected readonly sortable: string[] = ['createdAt', 'updatedAt'],
    protected readonly defaultSort: Sort = { createdAt: -1 },
  ) {}

  protected toApi(doc: { toJSON(): unknown } | null): TApi | null {
    return doc ? (doc.toJSON() as TApi) : null
  }

  protected toApiList(docs: { toJSON(): unknown }[]): TApi[] {
    return docs.map((d) => d.toJSON() as TApi)
  }

  async create(data: Partial<TDoc>, session?: ClientSession): Promise<TApi> {
    const doc = new this.model(data)
    await doc.save({ session })
    return doc.toJSON() as TApi
  }

  async findById(id: string): Promise<TApi | null> {
    return this.toApi(await this.model.findById(id))
  }

  async findOne(filter: FilterQuery<TDoc>): Promise<TApi | null> {
    return this.toApi(await this.model.findOne(filter))
  }

  async find(filter: FilterQuery<TDoc> = {}, sort: Sort = this.defaultSort): Promise<TApi[]> {
    return this.toApiList(await this.model.find(filter).sort(sort))
  }

  async exists(filter: FilterQuery<TDoc>): Promise<boolean> {
    return !!(await this.model.exists(filter))
  }

  async count(filter: FilterQuery<TDoc> = {}): Promise<number> {
    return this.model.countDocuments(filter)
  }

  async paginate(filter: FilterQuery<TDoc> = {}, options: PageOptions = {}): Promise<Page<TApi>> {
    const limit = Math.min(Math.max(1, Math.trunc(options.limit ?? 20)), config.pagination.maxPageSize)
    const page = Math.max(1, Math.trunc(options.page ?? 1))
    const [field, order] = (options.sort ?? '').split(':')
    const sort: Sort = field && this.sortable.includes(field) ? { [field]: order === 'asc' ? 1 : -1 } : this.defaultSort
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      this.model.countDocuments(filter),
    ])
    return { items: this.toApiList(docs), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  }

  /** $set of the given fields; returns the updated document, or null when it doesn't exist */
  async updateById(id: string, set: Partial<TDoc>, session?: ClientSession): Promise<TApi | null> {
    const update = { $set: set } as UpdateQuery<TDoc>
    return this.toApi(await this.model.findByIdAndUpdate(id, update, { new: true, runValidators: true, session }))
  }

  async deleteById(id: string, session?: ClientSession): Promise<TApi | null> {
    return this.toApi(await this.model.findByIdAndDelete(id, { session }))
  }
}
