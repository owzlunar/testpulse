import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Requirement, RequirementInput, TestCase } from '@/types'
import * as api from '@/services/requirement.service'
import { requirementText } from '@/services/requirement.service'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useProjectStore } from './project.store'
import { useTestCaseStore } from './test-case.store'

// Loaded on demand by the pages that need it (Requirements, case form, documents)
export const useRequirementStore = defineStore('requirement', () => {
  const requirements = ref<Requirement[]>([])
  const loaded = ref(false)
  const audit = useAuditStore()
  const projectStore = useProjectStore()

  let loading: Promise<void> | null = null
  function ensureLoaded(): Promise<void> {
    loading ??= api
      .fetchRequirements()
      .then((list) => {
        requirements.value = list
        loaded.value = true
      })
      .catch((e) => {
        loading = null
        throw e
      })
    return loading
  }

  const current = computed(() =>
    requirements.value
      .filter((r) => r.projectId === projectStore.currentProject?.id)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
  )

  /** next "REQ-<KEY>-NN" code for the current project */
  function nextCode(): string {
    const key = projectStore.currentProject?.key ?? 'PRJ'
    const max = current.value.reduce((m, r) => Math.max(m, Number(r.code.match(/(\d+)$/)?.[1] ?? 0)), 0)
    return `REQ-${key}-${String(max + 1).padStart(2, '0')}`
  }

  const qaOf = (cases: TestCase[]) => {
    const ids = useAuthStore().userIdsByName(...cases.map((c) => c.assignedTo))
    return ids.length ? { userIds: ids } : { disciplines: ['qa' as const] }
  }

  /** show the cases the server flagged for review and tell the team */
  function applyFlags(code: string, projectId: string, flagged: TestCase[], what: string) {
    if (!flagged.length) return
    useTestCaseStore().replaceMany(flagged)
    useNotificationStore().add({
      type: 'MODIFIED',
      title: `Requirement ${code} ${what}`,
      message: `Test Case ${flagged.length} รายการต้องทบทวน: ${flagged.map((c) => c.id).join(', ')}`,
      projectId,
      // the QA assigned to those cases, or every QA when none is
      to: qaOf(flagged),
      severity: 'warning',
    })
  }

  async function save(input: RequirementInput): Promise<Requirement> {
    const { requirement, flaggedCases } = await api.saveRequirement(input)
    const saved = requirement!
    applyFlags(saved.code, saved.projectId, flaggedCases, 'ถูกแก้ไข')
    const i = requirements.value.findIndex((r) => r.id === saved.id)
    if (i >= 0) requirements.value[i] = saved
    else requirements.value.push(saved)
    audit.record({
      action: input.id ? 'UPDATE' : 'CREATE',
      targetType: 'PROJECT',
      targetId: saved.code,
      targetTitle: saved.title,
      details: `${input.id ? 'แก้ไข' : 'เพิ่ม'} Requirement ${saved.code}`,
    })
    return saved
  }

  async function remove(id: string) {
    const target = requirements.value.find((r) => r.id === id)
    const { flaggedCases } = await api.deleteRequirement(id)
    requirements.value = requirements.value.filter((r) => r.id !== id)
    if (target) applyFlags(target.code, target.projectId, flaggedCases, 'ถูกลบ')
    if (target)
      audit.record({
        action: 'DELETE',
        targetType: 'PROJECT',
        targetId: target.code,
        targetTitle: target.title,
        details: `ลบ Requirement ${target.code}`,
      })
  }

  /** a case's requirement as text (falls back to the case's own text until requirements are loaded) */
  const textFor = (tc: TestCase) => requirementText(tc, requirements.value)

  return { requirements, loaded, current, ensureLoaded, nextCode, save, remove, textFor }
})
