import type { DocumentApi } from '@/api/contract'
import type { DocumentRecord, DocumentTemplate } from '@/types'
import { del, get, patch, post, put } from './http'

// The server collects the data, stamps who made a document and when each line was signed.
const path = (id: string) => `/documents/${encodeURIComponent(id)}`

export const documentApi: DocumentApi = {
  fetchDocuments: () => get<DocumentRecord[]>('/documents'),
  generateDocument: (req) => post<DocumentRecord>('/documents', req),
  regenerateDocument: (id) => post<DocumentRecord>(`${path(id)}/regenerate`),
  updateDocument: (id, fields) => patch<DocumentRecord>(path(id), fields),
  signDocument: (id, index, decision, comment = '') => post<DocumentRecord>(`${path(id)}/signatures/${index}`, { decision, comment }),
  deleteDocument: async (id) => {
    await del<null>(path(id))
  },
  fetchDocumentTemplate: () => get<DocumentTemplate>('/organization/document-template'),
  saveDocumentTemplate: (tpl) => put<DocumentTemplate>('/organization/document-template', tpl),
}
