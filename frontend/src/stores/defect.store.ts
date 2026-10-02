import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Defect, DefectInput, DefectStatus } from '@/types'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useProjectStore } from './project.store'
import { defectApi as api } from '@/api'

export const useDefectStore = defineStore('defect', () => {
  const defects = ref<Defect[]>([])
  const loaded = ref(false)
  const projectStore = useProjectStore()
  const audit = useAuditStore()
  const auth = useAuthStore()
  const notify = useNotificationStore()

  let loading: Promise<void> | null = null
  function ensureLoaded(): Promise<void> {
    loading ??= api
      .fetchDefects()
      .then((list) => {
        defects.value = list
        loaded.value = true
      })
      .catch((e) => {
        loading = null
        throw e
      })
    return loading
  }

  const current = computed(() =>
    defects.value.filter((d) => d.projectId === projectStore.currentProject?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )

  const forCase = (caseId: string) => current.value.filter((d) => d.caseId === caseId && !d.caseDeleted)
  const replace = (d: Defect) => {
    const i = defects.value.findIndex((x) => x.id === d.id)
    if (i >= 0) defects.value[i] = d
    else defects.value.unshift(d)
  }

  /** the developer the defect is assigned to, or every developer when unassigned */
  const assigneeOf = (name?: string) => {
    const ids = auth.userIdsByName(name)
    return ids.length ? { userIds: ids } : { disciplines: ['dev' as const] }
  }

  async function save(input: DefectInput): Promise<Defect> {
    const saved = await api.saveDefect(input, auth.currentUser.name)
    replace(saved)
    audit.record({
      action: input.id ? 'UPDATE' : 'CREATE',
      targetType: 'TEST_CASE',
      targetId: saved.id,
      targetTitle: saved.title,
      details: input.id ? `แก้ไข ${saved.id}` : `รายงาน ${saved.id} (${saved.severity}) จาก ${saved.caseId ?? '-'}`,
    })
    if (!input.id) {
      notify.add({
        type: 'STATUS_CHANGED',
        title: `Defect ใหม่ ${saved.id}`,
        message: `${saved.title} · มอบหมาย ${saved.assignee || 'ทีม Dev'}`,
        projectId: saved.projectId,
        testCaseId: saved.caseId,
        to: assigneeOf(saved.assignee),
        severity: saved.severity === 'critical' || saved.severity === 'major' ? 'error' : 'warning',
      })
    }
    return saved
  }

  async function setStatus(d: Defect, status: DefectStatus) {
    const { id, createdAt: _c, updatedAt: _u, comments: _cm, reportedBy: _r, ...rest } = d
    await save({ ...rest, id, status })
  }

  async function comment(id: string, text: string) {
    replace(await api.addDefectComment(id, { by: auth.currentUser.name, at: new Date().toISOString(), text }))
  }

  /** a reorder renumbered case ids (the server already re-keyed its copy) */
  function renameCases(projectId: string, renames: Record<string, string>) {
    defects.value.forEach((d) => {
      if (d.projectId === projectId && d.caseId && !d.caseDeleted) d.caseId = renames[d.caseId] ?? d.caseId
    })
  }

  /** cases were deleted (the server already detached its copy) */
  function detachCases(projectId: string, caseIds: string[]) {
    defects.value.forEach((d) => {
      if (d.projectId === projectId && d.caseId && caseIds.includes(d.caseId)) d.caseDeleted = true
    })
  }

  return { defects, loaded, current, ensureLoaded, forCase, save, setStatus, comment, renameCases, detachCases }
})
