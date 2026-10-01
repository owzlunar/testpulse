import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { DocumentRecord, DocumentRequest, DocumentTemplate } from '@/types'
import * as api from '@/services/document.service'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useProjectStore } from './project.store'

export const useDocumentStore = defineStore('document', () => {
  const documents = ref<DocumentRecord[]>([])
  const template = ref<DocumentTemplate>({ ...api.DEFAULT_TEMPLATE })
  const loaded = ref(false)
  const projectStore = useProjectStore()
  const audit = useAuditStore()
  const auth = useAuthStore()
  const notify = useNotificationStore()

  let loading: Promise<void> | null = null
  function ensureLoaded(): Promise<void> {
    loading ??= Promise.all([api.fetchDocuments(), api.fetchDocumentTemplate()])
      .then(([docs, tpl]) => {
        documents.value = docs
        template.value = tpl
        loaded.value = true
      })
      .catch((e) => {
        loading = null
        throw e
      })
    return loading
  }

  const current = computed(() =>
    documents.value.filter((d) => d.projectId === projectStore.currentProject?.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  )
  const getById = (id: string) => documents.value.find((d) => d.id === id)
  const replace = (doc: DocumentRecord) => {
    const i = documents.value.findIndex((d) => d.id === doc.id)
    if (i >= 0) documents.value[i] = doc
    else documents.value.unshift(doc)
    return doc
  }

  /** next running number for today's documents of a type */
  const nextSeq = (type: DocumentRecord['type']) =>
    current.value.filter((d) => d.type === type && d.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length + 1

  const log = (doc: DocumentRecord, details: string) =>
    audit.record({ action: 'EXPORT', targetType: 'PROJECT', targetId: doc.docNumber, targetTitle: doc.title, details })

  async function generate(req: DocumentRequest) {
    const doc = replace(await api.generateDocument(req, auth.currentUser.name))
    log(doc, `สร้างเอกสาร ${doc.docNumber} (${api.documentTypeOf(doc.type).label})`)
    return doc
  }

  async function regenerate(id: string) {
    const doc = replace(await api.regenerateDocument(id))
    log(doc, `สร้าง ${doc.docNumber} เวอร์ชัน ${doc.version} จากข้อมูลล่าสุด`)
    return doc
  }

  async function requestSignoff(id: string) {
    const doc = replace(await api.updateDocument(id, { status: 'pending_signoff' }))
    log(doc, `ส่ง ${doc.docNumber} ขอลงนาม ${doc.signatories.length} คน`)
    notify.add({
      type: 'SYSTEM',
      title: 'ส่งเอกสารขอลงนามแล้ว',
      message: `${doc.docNumber} · ${doc.signatories.map((s) => s.name || s.role).join(', ')}`,
      projectId: doc.projectId,
      severity: 'info',
    })
    return doc
  }

  async function sign(id: string, index: number, decision: 'signed' | 'rejected', comment = '') {
    const doc = replace(await api.signDocument(id, index, decision, comment))
    const who = doc.signatories[index]
    log(doc, `${who.name || who.role} ${decision === 'signed' ? 'ลงนาม' : 'ปฏิเสธ'} ${doc.docNumber}${comment ? ` (${comment})` : ''}`)
    if (doc.status === 'signed') {
      notify.add({
        type: 'SYSTEM',
        title: 'เอกสารลงนามครบแล้ว',
        message: `${doc.docNumber} ${doc.title}`,
        projectId: doc.projectId,
        severity: 'success',
      })
    }
    return doc
  }

  async function update(id: string, patch: Parameters<typeof api.updateDocument>[1]) {
    return replace(await api.updateDocument(id, patch))
  }

  async function remove(id: string) {
    await api.deleteDocument(id)
    documents.value = documents.value.filter((d) => d.id !== id)
  }

  async function saveTemplate(tpl: DocumentTemplate) {
    template.value = await api.saveDocumentTemplate(tpl)
  }

  return {
    documents,
    template,
    loaded,
    current,
    ensureLoaded,
    getById,
    nextSeq,
    generate,
    regenerate,
    requestSignoff,
    sign,
    update,
    remove,
    saveTemplate,
  }
})
