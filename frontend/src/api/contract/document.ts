import type { DocumentRecord, DocumentRequest, DocumentTemplate } from '@/types'

export interface DocumentApi {
  /** GET /documents */
  fetchDocuments(): Promise<DocumentRecord[]>

  /** POST /documents (the server collects the data and freezes it in `snapshot`) */
  generateDocument(req: DocumentRequest, createdBy: string): Promise<DocumentRecord>

  /** POST /documents/:id/regenerate (new version with fresh data; signatures reset) */
  regenerateDocument(id: string): Promise<DocumentRecord>

  /** PATCH /documents/:id */
  updateDocument(id: string, patch: Partial<Pick<DocumentRecord, 'title' | 'docNumber' | 'signatories' | 'uat' | 'status'>>): Promise<DocumentRecord>

  /** POST /documents/:id/signatures/:index  { decision, comment } */
  signDocument(id: string, index: number, decision: 'signed' | 'rejected', comment?: string): Promise<DocumentRecord>

  /** DELETE /documents/:id (drafts only) */
  deleteDocument(id: string): Promise<void>

  /** GET /organization/document-template */
  fetchDocumentTemplate(): Promise<DocumentTemplate>

  /** PUT /organization/document-template */
  saveDocumentTemplate(tpl: DocumentTemplate): Promise<DocumentTemplate>
}
