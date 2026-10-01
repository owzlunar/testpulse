import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ResultStatus, RunResult, TestCaseStatus, TestRun, TestRunInput } from '@/types'
import * as api from '@/services/run.service'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useProjectStore } from './project.store'
import { useTestCaseStore } from './test-case.store'

/** a run verdict that should also become the case's current status */
const CASE_STATUS: Partial<Record<ResultStatus, TestCaseStatus>> = { passed: 'passed', failed: 'failed', blocked: 'blocked' }

export const useRunStore = defineStore('run', () => {
  const runs = ref<TestRun[]>([])
  const loaded = ref(false)
  const projectStore = useProjectStore()
  const testCaseStore = useTestCaseStore()
  const audit = useAuditStore()
  const auth = useAuthStore()

  let loading: Promise<void> | null = null
  function ensureLoaded(): Promise<void> {
    loading ??= api.fetchRuns().then((list) => {
      runs.value = list
      loaded.value = true
    }).catch((e) => {
      loading = null
      throw e
    })
    return loading
  }

  /** runs of the selected project, newest first */
  const current = computed(() =>
    runs.value.filter((r) => r.projectId === projectStore.currentProject?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )

  const getById = (id: string) => runs.value.find((r) => r.id === id)
  const replace = (run: TestRun) => (runs.value = runs.value.map((r) => (r.id === run.id ? run : r)))

  async function create(input: TestRunInput): Promise<TestRun> {
    const run = await api.createRun(input, testCaseStore.casesOf(input.projectId), auth.currentUser.name)
    runs.value.unshift(run)
    audit.record({ action: 'CREATE', targetType: 'PROJECT', targetId: run.id, targetTitle: run.name, details: `สร้างรอบทดสอบ ${run.name} รอบที่ ${run.round} (${run.results.length} เคส)` })
    return run
  }

  async function update(id: string, patch: Partial<Omit<TestRun, 'results'>>) {
    replace(await api.updateRun(id, patch))
  }

  async function complete(id: string) {
    await update(id, { status: 'completed', completedAt: new Date().toISOString() })
    const run = getById(id)
    if (run) audit.record({ action: 'STATUS_CHANGE', targetType: 'PROJECT', targetId: run.id, targetTitle: run.name, details: `ปิดรอบทดสอบ ${run.name} รอบที่ ${run.round}` })
  }

  /** save one case's execution; the verdict also updates the test case itself */
  async function saveResult(runId: string, result: RunResult) {
    const stamped: RunResult = { ...result, executedBy: auth.currentUser.name, executedAt: new Date().toISOString() }
    const run = await api.saveResult(runId, stamped)
    replace(run)
    const caseStatus = CASE_STATUS[result.status]
    const tc = testCaseStore.getById(result.caseId, run.projectId)
    if (caseStatus && tc && tc.status !== caseStatus) {
      await testCaseStore.update(tc.id, {
        status: caseStatus,
        actualResults: result.actualResults || tc.actualResults,
        executedBy: stamped.executedBy,
        executedAt: stamped.executedAt,
        changeSummary: `ผลจาก ${run.name} รอบที่ ${run.round}: ${caseStatus}`,
      }, run.projectId)
    }
    return run
  }

  /** a reorder renumbered case ids (the server already re-keyed its copy) */
  function renameCases(projectId: string, renames: Record<string, string>) {
    runs.value.filter((r) => r.projectId === projectId).forEach((run) => run.results.forEach((r) => (r.caseId = renames[r.caseId] ?? r.caseId)))
  }

  async function remove(id: string) {
    await api.deleteRun(id)
    runs.value = runs.value.filter((r) => r.id !== id)
  }

  /** next round number for a run name in this project */
  const nextRound = (name: string) => Math.max(0, ...current.value.filter((r) => r.name === name).map((r) => r.round)) + 1

  return { runs, loaded, current, ensureLoaded, getById, create, update, complete, saveResult, remove, nextRound, renameCases }
})
