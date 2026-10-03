import type { DocumentRecord, DocumentTemplate } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { DocumentModel, DocumentTemplateModel, type DocumentDoc } from './document.model.js'

const TEMPLATE = 'organization'

class DocumentRepository extends BaseRepository<DocumentDoc, DocumentRecord> {
  constructor() {
    super(DocumentModel, ['createdAt', 'updatedAt'], { updatedAt: -1 })
  }

  ofProjects(projectIds: string[]): Promise<DocumentRecord[]> {
    return this.find({ projectId: { $in: projectIds } })
  }

  /** `when` guards against a change made in between (e.g. two people signing the same line) */
  async update(id: string, fields: Partial<DocumentDoc>, when: Record<string, unknown> = {}): Promise<DocumentRecord | null> {
    return this.toApi(await DocumentModel.findOneAndUpdate({ _id: id, ...when }, { $set: fields }, { new: true }))
  }

  async remove(id: string): Promise<void> {
    await DocumentModel.findOneAndDelete({ _id: id })
  }

  deleteOfProject(projectId: string) {
    return DocumentModel.deleteMany({ projectId })
  }

  async template(): Promise<Partial<DocumentTemplate> | null> {
    return DocumentTemplateModel.findById(TEMPLATE).lean()
  }

  async saveTemplate(template: DocumentTemplate): Promise<void> {
    await DocumentTemplateModel.findOneAndUpdate({ _id: TEMPLATE }, { $set: template }, { upsert: true })
  }
}

export const documentRepository = new DocumentRepository()
