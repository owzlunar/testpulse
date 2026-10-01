import { defineStore } from 'pinia'
import { ref } from 'vue'
import confetti from 'canvas-confetti'
import type { Actor, AuditChange, TestCase, TestCaseDraft, TestCaseInput, TestCaseNode, TestCaseReorderResult, TestCaseUpdateResult } from '@/types'
import * as api from '@/services/test-case.service'
import { statusOf } from '@/services/test-case.service'
import { addDays, daysFromToday, todayISO } from '@/utils/date'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useDefectStore } from './defect.store'
import { useNotificationStore } from './notification.store'
import { useRunStore } from './run.store'
import { useSettingsStore } from './settings.store'

export const useTestCaseStore = defineStore('testCase', () => {
  const testCases = ref<TestCase[]>([])
  const audit = useAuditStore()
  const notify = useNotificationStore()
  const auth = useAuthStore()
  const settingsStore = useSettingsStore()

  async function load() {
    testCases.value = await api.fetchTestCases()
  }

  /** replace one case in local state with the server copy */
  const replaceLocal = (tc: TestCase) => {
    const i = testCases.value.findIndex((x) => x.projectId === tc.projectId && x.id === tc.id)
    if (i >= 0) testCases.value[i] = tc
  }
  /** the signed-in user, sent with mutations (the real backend reads it from the session) */
  const actor = (): Actor => ({ id: auth.currentUser.id, name: auth.currentUser.name, avatar: auth.currentUser.avatar })

  // --- queries ---------------------------------------------------------------
  const casesOf = (projectId: string) => testCases.value.filter((tc) => tc.projectId === projectId)

  /** parent cases with their sub-cases */
  function treeOf(projectId: string): TestCaseNode[] {
    const cases = casesOf(projectId)
    return cases
      .filter((tc) => !tc.parentId)
      .map((parent) => ({ ...parent, subCases: cases.filter((sub) => sub.parentId === parent.id) }))
  }

  /** ids restart at TC-101 in every project, so pass the project when you have it */
  const getById = (id: string, projectId?: string) =>
    testCases.value.find((tc) => tc.id === id && (!projectId || tc.projectId === projectId))

  /** next "TC-1xx" id, or "<parent>-n" for a sub-case */
  function nextId(projectId: string, parentId?: string | null): { id: string; numericId: number } {
    const cases = casesOf(projectId)
    const numericId = cases.filter((tc) => !tc.parentId).reduce((max, tc) => Math.max(max, tc.numericId || 100), 100) + 1
    if (!parentId) return { id: `TC-${numericId}`, numericId }

    const subs = cases.filter((tc) => tc.parentId === parentId)
    const maxSub = subs.reduce((max, s) => Math.max(max, Number(s.id.match(/-(\d+)$/)?.[1] ?? subs.length)), 0)
    return { id: `${parentId}-${maxSub + 1}`, numericId }
  }

  // --- SLA / expiry notifications -------------------------------------------
  /** notify once per case: skip while an unread due-date alert for it already exists */
  function checkExpiry(tc: TestCase) {
    const { alertOnExpiry, expiryDaysThreshold } = settingsStore.settings
    if (!alertOnExpiry || !tc.expiryDate || tc.status === 'passed') return
    if (notify.notifications.some((n) => n.type === 'EXPIRING' && !n.read && n.testCaseId === tc.id)) return

    const left = daysFromToday(tc.expiryDate)
    const base = { type: 'EXPIRING' as const, projectId: tc.projectId, testCaseId: tc.id }

    if (left >= 0 && left <= expiryDaysThreshold) {
      notify.add({
        ...base,
        title: 'Test Case ใกล้ครบกำหนด',
        message: `${tc.id}: "${tc.name}" ครบกำหนด${left === 0 ? 'วันนี้' : `ในอีก ${left} วัน`} (${tc.expiryDate})`,
        severity: left <= 1 ? 'error' : 'warning',
      })
    } else if (left < 0) {
      // escalate to whoever is holding the case
      const target =
        tc.status === 'ready_for_test'
          ? 'แจ้งเตือนทีม QA ให้เร่งทดสอบ'
          : tc.status === 'pending' || tc.status === 'failed'
            ? `แจ้งเตือน ${tc.assignedDev || 'ทีม Dev'}`
            : ''
      notify.add({
        ...base,
        title: `เลยกำหนด SLA ${-left} วัน`,
        message: `${tc.id}: "${tc.name}" เลยกำหนดส่งมอบ (${tc.expiryDate}) ${target}`.trim(),
        severity: 'error',
      })
    }
  }

  const scanAllExpiries = () => testCases.value.forEach(checkExpiry)

  // --- mutations ---------------------------------------------------------------
  /** create one case; the server builds it (v1.0, history) and checks the id is free */
  async function create(input: TestCaseInput): Promise<TestCase> {
    const [tc] = await api.createTestCases(input.projectId, [input], actor())
    // new cases go to the end: the list order is the manual order (see reorder)
    testCases.value.push(tc)

    const isSub = !!tc.parentId
    audit.record({
      action: isSub ? 'ADD_SUBCASE' : 'CREATE',
      targetType: 'TEST_CASE',
      targetId: tc.id,
      projectId: tc.projectId,
      targetTitle: tc.name,
      details: isSub ? `สร้าง Sub-case ภายใต้ ${tc.parentId} (${tc.version})` : `สร้าง Test Case ${tc.id} - ${tc.name} (${tc.version})`,
    })
    notify.add({
      type: 'MODIFIED',
      title: isSub ? 'เพิ่ม Sub-case ใหม่' : 'สร้าง Test Case ใหม่',
      message: `${tc.id}: "${tc.name}" (${tc.version})`,
      projectId: tc.projectId,
      testCaseId: tc.id,
      severity: 'info',
    })
    if (tc.status === 'pending') {
      notify.add({
        type: 'STATUS_CHANGED',
        title: 'มี Test Case ใหม่รอ Dev พัฒนา',
        message: `${tc.id}: "${tc.name}" ${tc.assignedDev ? `มอบหมายให้ ${tc.assignedDev}` : 'รอ Developer รับงาน'} เมื่อเสร็จให้กด "ส่งมอบพร้อมเทส"`,
        projectId: tc.projectId,
        testCaseId: tc.id,
        severity: 'info',
      })
    }
    checkExpiry(tc)
    return tc
  }

  /** draft (template / import / AI) -> new-case input with sensible defaults */
  function fromDraft(draft: TestCaseDraft, projectId: string, id: string, numericId: number, parentId: string | null = null): TestCaseInput {
    return {
      id, numericId, parentId, projectId,
      name: draft.name,
      requirement: draft.requirement,
      requirementIds: draft.requirementIds ?? [],
      testScenario: draft.testScenario,
      prerequisite: draft.prerequisite,
      description: draft.description ?? '',
      priority: draft.priority,
      steps: draft.steps.map((st, i) => ({ ...st, id: `s-${Date.now()}-${numericId}-${i}`, stepNumber: i + 1 })),
      expectedResults: draft.expectedResults,
      expectedImages: [], actualResults: '', actualImages: [],
      status: 'pending',
      expiryDate: addDays(todayISO(), 7),
      assignedTo: auth.currentUser.name,
      assignedDev: '',
      version: 'v1.0',
    }
  }

  /** Create several top-level cases at once (import, AI drafts); the server numbers them after the last TC */
  async function createMany(projectId: string, drafts: TestCaseDraft[], source: string): Promise<TestCase[]> {
    const saved = await api.createTestCases(projectId, drafts.map((d, i) => fromDraft(d, projectId, '', i)), actor())
    testCases.value = [...testCases.value, ...saved]
    audit.record({
      action: 'CREATE',
      targetType: 'PROJECT',
      targetId: projectId,
      targetTitle: `${source} ${saved.length} เคส`,
      details: `${source} Test Case ${saved.length} รายการ (${saved[0]?.id} – ${saved.at(-1)?.id})`,
    })
    notify.add({
      type: 'MODIFIED',
      title: `${source} Test Case ${saved.length} รายการ`,
      message: `${saved[0]?.id} – ${saved.at(-1)?.id} พร้อมให้ตรวจทาน`,
      projectId,
      severity: 'success',
    })
    return saved
  }

  /** save a change; the server decides the version and status (see applyCasePatch in the service) */
  async function update(id: string, patch: Partial<TestCaseInput>, projectId?: string): Promise<TestCase | null> {
    const old = getById(id, projectId)
    if (!old) return null
    return applyUpdate(await api.updateTestCase(old.projectId, id, patch, actor()))
  }

  /** show a server-side case update and record its audit entry / alerts (also used by run results) */
  function applyUpdate({ testCase: tc, before: old, statusChanged, newVersion, passInvalidated }: TestCaseUpdateResult): TestCase {
    replaceLocal(tc)

    const changes: AuditChange[] = []
    if (statusChanged) changes.push({ field: 'status', oldValue: old.status, newValue: tc.status })
    if (tc.name !== old.name) changes.push({ field: 'name', oldValue: old.name, newValue: tc.name })
    if (tc.actualResults && tc.actualResults !== old.actualResults) {
      changes.push({ field: 'actualResults', oldValue: old.actualResults, newValue: tc.actualResults })
    }
    if (tc.rootCauseTag && tc.rootCauseTag !== old.rootCauseTag) {
      changes.push({ field: 'rootCauseTag', oldValue: old.rootCauseTag, newValue: tc.rootCauseTag })
    }

    audit.record({
      action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
      targetType: 'TEST_CASE',
      targetId: tc.id,
      projectId: tc.projectId,
      targetTitle: tc.name,
      details: [
        newVersion && `${old.version} → ${tc.version}`,
        passInvalidated ? 'แก้ไขข้อกำหนดหลังผ่านการทดสอบ สถานะกลับเป็นพร้อมให้ทดสอบ'
        : statusChanged ? `เปลี่ยนสถานะเป็น ${statusOf(tc.status).label}`
        : 'อัปเดตรายละเอียดของ Test Case',
      ].filter(Boolean).join(' · '),
      changes,
    })

    const base = { projectId: tc.projectId, testCaseId: tc.id }
    const { alertOnModification, alertOnStatusChange } = settingsStore.settings
    if (!statusChanged) {
      if (alertOnModification)
        notify.add({ ...base, type: 'MODIFIED', title: 'มีการแก้ไข Test Case', message: `${tc.id}: "${tc.name}" ได้รับการแก้ไข`, severity: 'info' })
    } else if (!alertOnStatusChange) {
      // status alerts turned off in settings
    } else if (passInvalidated) {
      notify.add({
        ...base,
        type: 'STATUS_CHANGED',
        title: 'Test Case ต้องทดสอบใหม่',
        message: `${tc.id}: "${tc.name}" ถูกแก้ไขเป็น ${tc.version} หลังผ่านการทดสอบ ผลเดิมถูกยกเลิก`,
        severity: 'warning',
      })
    } else if (tc.status === 'ready_for_test') {
      notify.add({
        ...base,
        type: 'STATUS_CHANGED',
        title: 'Dev ส่งมอบงาน พร้อมให้ทดสอบ',
        message: `${tc.id}: "${tc.name}" ส่งมอบโดย ${auth.currentUser.name} รอ QA ตรวจสอบ`,
        severity: 'info',
      })
    } else if (tc.status === 'failed') {
      notify.add({
        ...base,
        type: 'STATUS_CHANGED',
        title: 'Test Case ไม่ผ่านการทดสอบ',
        message: `${tc.id}: "${tc.name}" ไม่ผ่าน แจ้งเตือน ${tc.assignedDev || 'ทีม Dev'} ให้ตรวจสอบและแก้ไข`,
        severity: 'error',
      })
    } else {
      notify.add({
        ...base,
        type: 'STATUS_CHANGED',
        title: 'สถานะ Test Case เปลี่ยนแปลง',
        message: `${tc.id}: ${statusOf(old.status).label} → ${statusOf(tc.status).label}`,
        severity: tc.status === 'passed' ? 'success' : 'warning',
      })
    }

    if (statusChanged && tc.status === 'passed') celebrate(tc.projectId)
    checkExpiry(tc)
    return tc
  }

  /** small burst on every pass, a big one when the whole project reaches 100% */
  function celebrate(projectId: string) {
    const cases = casesOf(projectId)
    const allPassed = cases.length > 0 && cases.every((c) => c.status === 'passed')
    try {
      confetti(allPassed ? { particleCount: 220, spread: 100, origin: { y: 0.6 } } : { particleCount: 60, spread: 55, origin: { y: 0.7 } })
    } catch {
      /* canvas not available */
    }
  }

  /** deletes the case and its sub-cases */
  async function remove(id: string, projectId?: string) {
    const target = getById(id, projectId)
    if (!target) return
    const ids = await api.deleteTestCase(target.projectId, id)
    testCases.value = testCases.value.filter((tc) => !(tc.projectId === target.projectId && ids.includes(tc.id)))
    useRunStore().detachCases(target.projectId, ids)
    useDefectStore().detachCases(target.projectId, ids)
    notify.detachCases(target.projectId, ids)
    audit.detachCases(target.projectId, ids)

    audit.record({
      action: 'DELETE',
      targetType: 'TEST_CASE',
      targetId: id,
      projectId: target.projectId,
      targetDeleted: true,
      targetTitle: target.name,
      details: ids.length > 1 ? `ลบ Test Case ${id} รวมถึง Sub-case ${ids.slice(1).join(', ')}` : `ลบ Test Case ${id}`,
    })
    notify.add({
      type: 'MODIFIED',
      title: 'ลบ Test Case',
      message: `${id}: "${target.name}" ถูกลบออกจากระบบ`,
      projectId: target.projectId,
      severity: 'warning',
    })
  }

  /** used when a project is deleted (the project's own audit entry covers it) */
  function removeProjectCases(projectId: string) {
    testCases.value = testCases.value.filter((tc) => tc.projectId !== projectId)
  }

  /** Reschedule with a mandatory reason (checked by the server); writes the audit trail */
  async function extendDueDate(id: string, newDate: string, reason: string, projectId?: string): Promise<TestCase | null> {
    const old = getById(id, projectId)
    if (!old) return null
    const { testCase: tc, oldDate: previous } = await api.extendDueDate(old.projectId, id, newDate, reason, actor())
    const oldDate = previous || '-'
    replaceLocal(tc)

    audit.record({
      action: 'EXTEND_DUE_DATE',
      targetType: 'TEST_CASE',
      targetId: tc.id,
      projectId: tc.projectId,
      targetTitle: tc.name,
      details: `ขยายกำหนดส่งจาก ${oldDate} เป็น ${newDate} (เหตุผล: ${reason})`,
      changes: [{ field: 'expiryDate', oldValue: oldDate, newValue: newDate }],
    })
    notify.add({
      type: 'MODIFIED',
      title: 'ขยายกำหนดส่งมอบ',
      message: `${tc.id}: เลื่อนเป็น ${newDate} โดย ${auth.currentUser.name} — ${reason}`,
      projectId: tc.projectId,
      testCaseId: tc.id,
      severity: 'info',
    })
    return tc
  }

  /**
   * Save a new order; the server renumbers ids (TC-101, TC-102 … and TC-101-1 …) and re-keys
   * run results, defects, notifications and audit entries so they follow their case.
   */
  async function reorder(projectId: string, ordered: TestCaseNode[]) {
    // optimistic: show the new order at once (old ids until the server answers), roll back if it refuses
    const previous = testCases.value
    const flat = ordered.flatMap(({ subCases, ...parent }) => [parent, ...subCases])
    testCases.value = [...flat, ...previous.filter((tc) => tc.projectId !== projectId)]
    let result: TestCaseReorderResult
    try {
      result = await api.reorderTestCases(projectId, ordered.map((p) => ({ id: p.id, subIds: p.subCases.map((s) => s.id) })))
    } catch (e) {
      testCases.value = previous
      throw e
    }
    testCases.value = [...result.cases, ...testCases.value.filter((tc) => tc.projectId !== projectId)]

    const { renames } = result
    if (Object.keys(renames).length) {
      useRunStore().renameCases(projectId, renames)
      useDefectStore().renameCases(projectId, renames)
      notify.renameCases(projectId, renames)
      audit.renameCases(projectId, renames)
    }
    const moved = Object.entries(renames).map(([from, to]) => `${from} → ${to}`)
    audit.record({
      action: 'UPDATE',
      targetType: 'PROJECT',
      targetId: projectId,
      targetTitle: 'จัดลำดับ Test Case',
      details: moved.length ? `จัดลำดับ Test Case และเปลี่ยนรหัส: ${moved.join(', ')}` : 'จัดลำดับ Test Case (รหัสไม่เปลี่ยน)',
    })
  }

  return {
    testCases,
    load, fromDraft, createMany, applyUpdate, replaceLocal, casesOf, treeOf, getById, nextId,
    create, update, remove, removeProjectCases, extendDueDate, reorder, scanAllExpiries,
  }
})
