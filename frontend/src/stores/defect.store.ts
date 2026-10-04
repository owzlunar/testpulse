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

  /**
   * who works on it: the assignee, else every developer (code) or the team running the environment
   * it was found on, else everyone in ops (server problems)
   */
  const assigneeOf = (d: Defect) => {
    const ids = auth.userIdsByName(d.assignee)
    if (ids.length) return { userIds: ids }
    if (d.cause !== 'environment') return { disciplines: ['dev' as const] }
    const envTeam = projectStore.projects.find((p) => p.id === d.projectId)?.environments?.find((e) => e.id === d.environmentId)?.teamId
    const team = auth.teams.find((t) => t.id === envTeam)
    return team?.memberIds.length ? { userIds: team.memberIds } : { disciplines: ['ops' as const] }
  }
  /** the QA who reported it, else every QA */
  const reporterOf = (d: Defect) => {
    const ids = auth.userIdsByName(d.reportedBy)
    return ids.length ? { userIds: ids } : { disciplines: ['qa' as const] }
  }
  const sideOf = (d: Defect) => (d.cause === 'environment' ? `ทีม Server${d.environment ? ` (${d.environment})` : ''}` : 'ทีม Dev')

  async function save(input: DefectInput): Promise<Defect> {
    const before = input.id ? defects.value.find((d) => d.id === input.id) : undefined
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
        message: `${saved.title} · มอบหมาย ${saved.assignee || sideOf(saved)}`,
        projectId: saved.projectId,
        testCaseId: saved.caseId,
        to: assigneeOf(saved),
        severity: saved.severity === 'critical' || saved.severity === 'major' ? 'error' : 'warning',
      })
    } else if (before && before.cause !== saved.cause) {
      // QA found it is the other side's problem: it goes to them
      notify.add({
        type: 'STATUS_CHANGED',
        title: `${saved.id} ส่งต่อให้${sideOf(saved)}`,
        message: `${saved.title} · สาเหตุ: ${saved.cause === 'environment' ? 'Server / Environment' : 'โค้ด'}`,
        projectId: saved.projectId,
        testCaseId: saved.caseId,
        to: assigneeOf(saved),
        severity: 'warning',
      })
    } else if (before && saved.cause === 'environment' && saved.status === 'fixed' && before.status !== 'fixed') {
      // the server team fixed it: QA re-tests on that environment
      notify.add({
        type: 'STATUS_CHANGED',
        title: `${saved.id} แก้ไขแล้ว รอทดสอบซ้ำ${saved.environment ? `บน ${saved.environment}` : ''}`,
        message: saved.title,
        projectId: saved.projectId,
        testCaseId: saved.caseId,
        to: reporterOf(saved),
        severity: 'info',
      })
    }
    return saved
  }

  async function setStatus(d: Defect, status: DefectStatus) {
    const { id, createdAt: _c, updatedAt: _u, comments: _cm, reportedBy: _r, fixedAt: _f, ...rest } = d
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
