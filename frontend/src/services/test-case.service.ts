import type {
  ActiveUserPresence,
  CaseExpectation,
  Actor,
  Option,
  PermissionKey,
  Requirement,
  TestCase,
  TestCaseImpact,
  TestCaseInput,
  TestCaseOrder,
  TestCaseSpec,
  TestCasePriority,
  TestCaseReorderResult,
  TestCaseStatus,
  TestCaseUpdateResult,
  TestCaseVersionRecord,
  Tone,
} from '@/types'
import { daysFromToday, formatDateTime } from '@/utils/date'
import { detachAuditCases, renameAuditCases } from './audit.service'
import { defectsOf, detachDefectCases, isOpenDefect, renameDefectCases } from './defect.service'
import { ApiError, newId, respond } from './http'
import { detachNotificationCases, renameNotificationCases } from './notification.service'
import { casesForRequirement, requirementsForCase, requirementsOf } from './requirement.service'
import { detachRunCases, renameRunCases, runsOf } from './run.service'
import { assertCan, inAccessibleProjects, sessionCan } from './project.service'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage.service'
import { SEED_TEST_CASES } from './seeds/test-cases.seed'

// Dev <-> QA lifecycle: Pending Dev -> Ready for Test -> (QA) -> Passed | Failed -> back to Dev
export const STATUSES: Option<TestCaseStatus>[] = [
  { value: 'pending', label: 'Pending Dev', hint: 'รอ Dev พัฒนา', tone: 'primary', icon: 'tabler:code' },
  { value: 'ready_for_test', label: 'Ready for Test', hint: 'พร้อมให้ QA ทดสอบ', tone: 'info', icon: 'tabler:send' },
  { value: 'untested', label: 'Untested', hint: 'ยังไม่ได้ทดสอบ', tone: 'secondary', icon: 'tabler:circle-dashed' },
  { value: 'in_progress', label: 'In Progress', hint: 'กำลังทดสอบ', tone: 'warning', icon: 'tabler:progress' },
  { value: 'passed', label: 'Passed', hint: 'ผ่านการทดสอบ', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'failed', label: 'Failed', hint: 'ไม่ผ่าน / พบ Bug', tone: 'error', icon: 'tabler:circle-x' },
  { value: 'blocked', label: 'Blocked', hint: 'ติดปัญหาภายนอก', tone: 'caution', icon: 'tabler:ban' },
]

export const statusOf = (status: TestCaseStatus): Option<TestCaseStatus> => STATUSES.find((s) => s.value === status) ?? STATUSES[2]

/** QA verdicts (need canExecuteTest) */
export const EXECUTION_STATUSES: TestCaseStatus[] = ['in_progress', 'passed', 'failed', 'blocked', 'untested']

export const PRIORITIES: Option<TestCasePriority>[] = [
  { value: 'critical', label: 'Critical', hint: 'วิกฤต', tone: 'error', icon: 'tabler:flame' },
  { value: 'high', label: 'High', hint: 'สูง', tone: 'caution', icon: 'tabler:chevrons-up' },
  { value: 'medium', label: 'Medium', hint: 'ปานกลาง', tone: 'info', icon: 'tabler:equal' },
  { value: 'low', label: 'Low', hint: 'ต่ำ', tone: 'secondary', icon: 'tabler:chevron-down' },
]

export const priorityOf = (priority: TestCasePriority): Option<TestCasePriority> => PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[2]

export const ROOT_CAUSES: string[] = [
  'Race Condition',
  'Spec Gap',
  'External API Timeout',
  'Environment Downtime',
  'Data Validation Bug',
  'Concurrency Lock',
  'UI Rendering Glitch',
]

export const EXTEND_REASONS: string[] = [
  'Requirement เปลี่ยนแปลง (Spec Change)',
  'Third-party API / Sandbox ล่าช้า (External API Delay)',
  'Bug ซับซ้อน ต้อง Refactor (Complex Bug)',
  'สภาพแวดล้อมทดสอบขัดข้อง (Env Issue)',
  'รอข้อมูลทดสอบจากผู้ใช้จริง (Waiting for Test Data)',
  'ทรัพยากรไม่พอ / มีงานด่วนแทรก (Resource Constraint)',
  'อื่นๆ (Other)',
]

/** Where the case is waiting right now (Bottleneck "Current Dwell") */
export function dwellOf(status: TestCaseStatus): { label: string; tone: Tone; icon: string } {
  switch (status) {
    case 'pending':
      return { label: 'ทีม Dev กำลังพัฒนา', tone: 'primary', icon: 'tabler:code' }
    case 'ready_for_test':
    case 'untested':
    case 'in_progress':
      return { label: 'รอ QA ตรวจสอบ', tone: 'info', icon: 'tabler:shield-check' }
    case 'failed':
      return { label: 'ติด Bug รอ Dev แก้', tone: 'error', icon: 'tabler:bug' }
    case 'blocked':
      return { label: 'ติดปัญหาภายนอก', tone: 'caution', icon: 'tabler:ban' }
    default:
      return { label: 'เสร็จสิ้น', tone: 'success', icon: 'tabler:circle-check' }
  }
}

// --- SLA helpers ---------------------------------------------------------------
/** Passed cases never count as overdue */
export const isOverdue = (tc: TestCase): boolean => !!tc.expiryDate && tc.status !== 'passed' && daysFromToday(tc.expiryDate) < 0

export const overdueDays = (tc: TestCase): number => (isOverdue(tc) ? -daysFromToday(tc.expiryDate) : 0)

export const isDueSoon = (tc: TestCase, days = 3): boolean => {
  if (!tc.expiryDate || tc.status === 'passed') return false
  const left = daysFromToday(tc.expiryDate)
  return left >= 0 && left <= days
}

/** Ping-pong: bounced between Failed and Ready for Test more than once */
export const isHighChurn = (tc: TestCase): boolean => (tc.churnCount ?? 0) > 1

/** fields that define what is tested; changing any of them makes a new version */
const SPEC_FIELDS = [
  'name',
  'requirement',
  'requirementIds',
  'testScenario',
  'description',
  'prerequisite',
  'steps',
  'expectedResults',
  'expectedImages',
] as const satisfies readonly (keyof TestCase)[]

/** comparable form of a spec field: steps by text and order, empty lists equal to missing */
function specValue(tc: Partial<TestCase>, field: (typeof SPEC_FIELDS)[number]): string {
  const value =
    field === 'steps'
      ? tc.steps?.map((s) => [s.action.trim(), s.testData.trim(), s.expectedResult.trim()]).filter((s) => s.some(Boolean))
      : typeof tc[field] === 'string'
        ? (tc[field] as string).trim()
        : tc[field]
  return JSON.stringify(Array.isArray(value) && !value.length ? null : (value ?? null))
}

/**
 * Did the spec (what is tested) change? Status, due date, assignees and priority don't count:
 * they are tracked in the audit trail, not as versions.
 * Pass the requirements so a legacy case (linked by its text) compares with its effective links:
 * saving those links explicitly is not a change.
 */
export function hasSpecChanges(old: TestCase, next: Partial<TestCase>, requirements: Requirement[] = []): boolean {
  const base = old.requirementIds?.length ? old : { ...old, requirementIds: requirementsForCase(old, requirements).map((r) => r.id) }
  return SPEC_FIELDS.some((f) => f in next && specValue(base, f) !== specValue(next, f))
}

/** spec fields shown when comparing versions (requirement links shown together with the requirement text) */
export const SPEC_FIELD_LABELS: { field: keyof TestCaseSpec; label: string }[] = [
  { field: 'name', label: 'ชื่อ Test Case' },
  { field: 'requirement', label: 'Requirement' },
  { field: 'testScenario', label: 'Test Scenario' },
  { field: 'prerequisite', label: 'Prerequisite' },
  { field: 'description', label: 'คำอธิบายเพิ่มเติม' },
  { field: 'steps', label: 'ขั้นตอน' },
  { field: 'expectedResults', label: 'ผลลัพธ์ที่คาดหวัง' },
]

/** the spec part of a case, as stored in a version snapshot */
export const specOf = (tc: TestCaseSpec): TestCaseSpec => ({
  name: tc.name,
  requirement: tc.requirement,
  requirementIds: [...(tc.requirementIds ?? [])],
  testScenario: tc.testScenario,
  description: tc.description,
  prerequisite: tc.prerequisite,
  steps: tc.steps.map((s) => ({ ...s })),
  expectedResults: tc.expectedResults,
})

/** a spec whose requirement links are explicit: legacy text-linked specs get the links their text resolves to */
function withEffectiveLinks(spec: TestCaseSpec, projectId: string, requirements: Requirement[]): TestCaseSpec {
  if (spec.requirementIds?.length || !requirements.length) return spec
  const ids = requirementsForCase({ ...spec, projectId } as TestCase, requirements).map((r) => r.id)
  return { ...spec, requirementIds: ids }
}

/**
 * Fields (of SPEC_FIELD_LABELS) that differ between two specs; requirement covers the links too.
 * Pass the project's requirements so text-linked and explicitly linked specs compare by their effective links.
 */
export function specDiff(a: TestCaseSpec, b: TestCaseSpec, projectId = '', requirements: Requirement[] = []): (keyof TestCaseSpec)[] {
  const [x, y] = [withEffectiveLinks(a, projectId, requirements), withEffectiveLinks(b, projectId, requirements)]
  const differs = (f: (typeof SPEC_FIELDS)[number]) => specValue(x as Partial<TestCase>, f) !== specValue(y as Partial<TestCase>, f)
  return SPEC_FIELD_LABELS.map((l) => l.field).filter((f) => differs(f) || (f === 'requirement' && differs('requirementIds')))
}

/** v1.0 -> v1.1, or v2.0 when `major` */
export function nextVersion(current = 'v1.0', major = false): string {
  const [maj = 1, min = 0] = current
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  return major ? `v${maj + 1}.0` : `v${maj || 1}.${min + 1}`
}

const presenceOf = (actor: Actor): ActiveUserPresence => ({ ...actor, action: 'editing' })

/**
 * server-side rules for changing a case:
 * - a version is a change to what is tested (hasSpecChanges) or an asked-for major bump;
 *   status / due date / assignee changes stay in the audit trail
 * - a pass only proves the spec it ran against: changing the spec of a passed case sends it back to ready_for_test
 * - every bounce between Dev and QA counts as one churn round
 * - id, project and parent can't be changed by a patch
 */
export function applyCasePatch(old: TestCase, patch: Partial<TestCaseInput>, actor: Actor): TestCaseUpdateResult {
  const now = new Date().toISOString()
  const { changeSummary, bumpMajor, ...updates } = patch
  const specChanged = hasSpecChanges(old, updates, requirementsOf(old.projectId))
  const passInvalidated = specChanged && old.status === 'passed' && (updates.status ?? old.status) === 'passed'
  const status = passInvalidated ? 'ready_for_test' : (updates.status ?? old.status)
  const version =
    updates.version && updates.version !== old.version
      ? updates.version
      : specChanged || bumpMajor
        ? nextVersion(old.version, bumpMajor)
        : old.version
  const newVersion = version !== old.version
  const record: TestCaseVersionRecord = {
    version,
    updatedBy: actor.name,
    timestamp: now,
    changeSummary: (changeSummary || 'แก้ไขข้อกำหนดหรือขั้นตอน') + (passInvalidated ? ` (ผลผ่านของ ${old.version} ถูกยกเลิก ต้องทดสอบใหม่)` : ''),
    status,
    snapshot: specOf({ ...old, ...updates }),
  }
  const bounced =
    (old.status === 'failed' && status === 'ready_for_test') ||
    (old.status === 'ready_for_test' && status === 'failed') ||
    (old.status === 'pending' && status === 'ready_for_test')

  const testCase: TestCase = {
    ...old,
    ...updates,
    id: old.id,
    projectId: old.projectId,
    parentId: old.parentId,
    numericId: old.numericId,
    status,
    rev: (old.rev ?? 0) + 1,
    churnCount: (old.churnCount ?? 0) + (bounced ? 1 : 0),
    version,
    versionHistory: newVersion ? [...(old.versionHistory ?? []), record] : old.versionHistory,
    activeUser: presenceOf(actor),
    // editing the spec is the review a changed requirement asks for
    reviewNeeded: specChanged ? undefined : old.reviewNeeded,
    createdAt: old.createdAt,
    updatedAt: now,
  }
  return { testCase, before: old, statusChanged: status !== old.status, newVersion, passInvalidated }
}

// --- API ------------------------------------------------------------------------
/**
 * Re-applies demo fields that older saved data may be missing. Runs once only:
 * after users reorder (ids are renumbered) or delete cases, "TC-103" or "TC-104"
 * may be a different case or gone on purpose, so these fixes must not run again.
 */
function testCases(): TestCase[] {
  migrateOnce('demo-cases-v1', () => {
    const cases = load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
    const demo = (tc: TestCase, id: string) => tc.projectId === 'proj-1' && tc.id === id
    for (const tc of cases) {
      if (demo(tc, 'TC-102') && tc.parentId === 'TC-101') tc.id = 'TC-101-1'
      if (demo(tc, 'TC-103') && (!tc.churnCount || !tc.rootCauseTag)) {
        Object.assign(tc, { churnCount: 3, rootCauseTag: 'Race Condition', expiryDate: '2026-09-29', assignedDev: 'กิตติศักดิ์ พัฒนา (Dev Lead)' })
      }
    }
    const sample104 = SEED_TEST_CASES.find((c) => c.id === 'TC-104')
    if (sample104 && !cases.some((c) => demo(c, 'TC-104'))) cases.push(sample104)
    save(STORAGE_KEYS.testCases, cases)
  })
  // versions saved before snapshots existed: keep at least the current version's spec, so it can be restored later
  migrateOnce('version-snapshots-v1', () => {
    const cases = load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
    for (const tc of cases) {
      const current = [...(tc.versionHistory ?? [])].reverse().find((r) => r.version === tc.version)
      if (current && !current.snapshot) current.snapshot = specOf(tc)
    }
    save(STORAGE_KEYS.testCases, cases)
  })
  // every case gets a stable identity and a revision (stale-change detection, see assertFresh)
  migrateOnce('case-uid-rev-v1', () => {
    const cases = load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
    cases.forEach((tc) => {
      tc.uid ??= newId('tc')
      tc.rev ??= 1
    })
    save(STORAGE_KEYS.testCases, cases)
  })
  return load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
}

const sameCase = (a: TestCase, projectId: string, id: string) => a.projectId === projectId && a.id === id

/** GET /test-cases (of the projects the signed-in user may open) */
export const fetchTestCases = () => respond(() => (sessionCan('case.view') ? inAccessibleProjects(testCases()) : []))

/**
 * POST /projects/:projectId/test-cases (accepts several for import / AI drafts)
 * The server builds the case (v1.0, first history entry, timestamps) and assigns the next
 * TC number to inputs without an id; a given id must be free in the project.
 */
export const createTestCases = (projectId: string, inputs: TestCaseInput[], actor: Actor) =>
  respond(() => {
    assertCan('case.edit', projectId)
    const list = testCases()
    const now = new Date().toISOString()
    let next = list.filter((x) => x.projectId === projectId && !x.parentId).reduce((max, x) => Math.max(max, x.numericId || 100), 100) + 1
    const created: TestCase[] = []
    for (const input of inputs) {
      // the server owns these: a new case (also a clone or an import) always starts fresh at v1.0
      const {
        changeSummary: _summary,
        bumpMajor: _major,
        version: _version,
        versionHistory: _history,
        archivedAt: _archivedAt,
        archivedBy: _archivedBy,
        reviewNeeded: _review,
        churnCount: _churn,
        ...data
      } = input
      const numericId = data.id ? data.numericId : next
      const id = data.id?.trim() || `TC-${next}`
      if (!data.id) next++
      if ([...list, ...created].some((x) => sameCase(x, projectId, id))) throw new ApiError(`รหัส ${id} มีอยู่แล้วในโปรเจกต์นี้`, 409)
      const version = 'v1.0'
      created.push({
        ...data,
        id,
        uid: newId('tc'),
        rev: 1,
        numericId,
        projectId,
        version,
        versionHistory: [
          {
            version,
            updatedBy: actor.name,
            timestamp: now,
            changeSummary: 'สร้าง Test Case ครั้งแรก',
            status: data.status,
            snapshot: specOf(data),
          },
        ],
        activeUser: presenceOf(actor),
        createdAt: now,
        updatedAt: now,
      })
    }
    // appended: the stored order is the list order users arrange by drag and drop
    save(STORAGE_KEYS.testCases, [...list, ...created])
    return created
  })

/** server-side: every stored case (seeds the demo data on first use) */
export const storedCases = (): TestCase[] => testCases()

/** server-side: the stored case, if any */
export const storedCase = (projectId: string, id: string): TestCase | undefined => testCases().find((x) => sameCase(x, projectId, id))

/**
 * server-side: load, patch (see applyCasePatch) and save one case. Used by the update endpoint
 * and by run results that become the case status.
 */
export function patchStoredCase(
  projectId: string,
  id: string,
  patch: Partial<TestCaseInput>,
  actor: Actor,
  expected?: CaseExpectation,
): TestCaseUpdateResult {
  const list = testCases()
  const i = list.findIndex((x) => sameCase(x, projectId, id))
  if (i < 0) throw new ApiError(`ไม่พบ ${id}`, 404)
  assertFresh(list[i], expected)
  if (list[i].archivedAt) throw new ApiError(`${id} อยู่ในคลังเก็บ กู้คืนก่อนจึงแก้ไขได้`, 409)
  const result = applyCasePatch(list[i], patch, actor)
  list[i] = result.testCase
  save(STORAGE_KEYS.testCases, list)
  return result
}

/**
 * server-side: refuse (409, code 'stale') a change based on an outdated copy of the case: another
 * user saved it since (rev), or the list was renumbered and this id now belongs to another case (uid).
 * Without an expectation (internal calls) nothing is checked.
 */
export function assertFresh(tc: TestCase, expected?: CaseExpectation): void {
  if (!expected) return
  if (tc.uid && expected.uid !== tc.uid) {
    throw new ApiError(`รหัส ${tc.id} เป็นของอีกเคสแล้ว (มีการจัดลำดับใหม่) โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง`, 409, 'stale')
  }
  if ((tc.rev ?? 0) !== expected.rev) {
    const by = tc.activeUser?.name ?? 'ผู้ใช้อื่น'
    throw new ApiError(
      `${tc.id} ถูกแก้ไขโดย ${by} เมื่อ ${formatDateTime(tc.updatedAt)} หลังจากที่คุณเปิดดู โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง`,
      409,
      'stale',
    )
  }
}

/** PATCH /projects/:projectId/test-cases/:id (the server versions the case: see applyCasePatch; `expected`: see assertFresh) */
export const updateTestCase = (projectId: string, id: string, patch: Partial<TestCaseInput>, actor: Actor, expected?: CaseExpectation) =>
  respond(() => {
    assertCan(patchPermissions(patch, storedCase(projectId, id)), projectId)
    return patchStoredCase(projectId, id, patch, actor, expected)
  })

/**
 * what a patch needs: Dev hand-off (ready_for_test) needs case.handoff, verdicts need run.execute,
 * sending back to pending either of them; any other field is an edit (case.edit)
 */
function patchPermissions(patch: Partial<TestCaseInput>, old?: TestCase): PermissionKey[] {
  const { status, changeSummary: _s, bumpMajor: _b, ...rest } = patch
  const edits = Object.keys(rest).some((k) => JSON.stringify(rest[k as keyof typeof rest]) !== JSON.stringify(old?.[k as keyof TestCase]))
  if (edits) return ['case.edit']
  if (!status || status === old?.status) return ['case.edit']
  if (status === 'ready_for_test') return ['case.handoff']
  if (status === 'pending') return ['case.handoff', 'run.execute']
  return ['run.execute']
}

/**
 * POST /projects/:projectId/test-cases/:id/versions/:version/restore
 * Brings back the spec of an earlier version as a new version (same rules as an edit:
 * a passed case must be tested again). Images stay as they are (they are not kept in history).
 */
export const restoreVersion = (projectId: string, id: string, version: string, actor: Actor, expected?: CaseExpectation) =>
  respond(() => {
    assertCan('case.restoreVersion', projectId)
    const tc = storedCase(projectId, id)
    if (!tc) throw new ApiError(`ไม่พบ ${id}`, 404)
    assertFresh(tc, expected)
    const snapshot = tc.versionHistory?.find((r) => r.version === version)?.snapshot
    if (!snapshot) throw new ApiError(`${version} ไม่มีเนื้อหาที่บันทึกไว้ให้กู้คืน`, 404)
    const requirements = requirementsOf(projectId)
    if (!specDiff(snapshot, tc, projectId, requirements).length) throw new ApiError(`เนื้อหาของ ${version} เหมือนเวอร์ชันปัจจุบันแล้ว`, 409)
    // keep the links the old text resolved to, rather than dropping explicit links
    const spec = specOf(withEffectiveLinks(snapshot, projectId, requirements))
    return patchStoredCase(projectId, id, { ...spec, changeSummary: `กู้คืนเนื้อหาจาก ${version}` }, actor)
  })

/**
 * server-side: flag the active cases linked to a requirement that changed (or was deleted)
 * so QA reviews them. Returns the flagged cases.
 */
export function flagCasesForReview(req: Requirement, reason: string): TestCase[] {
  const list = testCases()
  const since = new Date().toISOString()
  const flagged = casesForRequirement(
    req,
    list.filter((x) => !x.archivedAt),
  )
  flagged.forEach((tc) => {
    const codes = new Set([...(tc.reviewNeeded?.requirementCodes ?? []), req.code])
    tc.reviewNeeded = { requirementCodes: [...codes], reason, since }
    tc.rev = (tc.rev ?? 0) + 1
  })
  if (flagged.length) save(STORAGE_KEYS.testCases, list)
  return flagged
}

/** POST /projects/:projectId/test-cases/:id/review (reviewed against the changed requirement: nothing to change) */
export const markReviewed = (projectId: string, id: string, actor: Actor, expected?: CaseExpectation) =>
  respond(() => {
    assertCan('case.edit', projectId)
    const list = testCases()
    const tc = list.find((x) => sameCase(x, projectId, id))
    if (!tc) throw new ApiError(`ไม่พบ ${id}`, 404)
    assertFresh(tc, expected)
    if (!tc.reviewNeeded) throw new ApiError(`${id} ไม่มีรายการที่ต้องทบทวน`, 409)
    const cleared = tc.reviewNeeded
    delete tc.reviewNeeded
    Object.assign(tc, { rev: (tc.rev ?? 0) + 1, activeUser: presenceOf(actor), updatedAt: new Date().toISOString() })
    save(STORAGE_KEYS.testCases, list)
    return { testCase: tc, cleared }
  })

/** PATCH /projects/:projectId/test-cases/:id/due-date (reason required; a due date is not part of the spec: no new version) */
export const extendDueDate = (projectId: string, id: string, newDate: string, reason: string, actor: Actor, expected?: CaseExpectation) =>
  respond(() => {
    assertCan(['case.edit', 'case.handoff'], projectId)
    if (!reason.trim()) throw new ApiError('ต้องระบุเหตุผลในการขยายเวลา', 422)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw new ApiError('วันที่ไม่ถูกต้อง', 422)
    const list = testCases()
    const tc = list.find((x) => sameCase(x, projectId, id))
    if (!tc) throw new ApiError(`ไม่พบ ${id}`, 404)
    if (tc.archivedAt) throw new ApiError(`${id} อยู่ในคลังเก็บ กู้คืนก่อนจึงแก้ไขได้`, 409)
    assertFresh(tc, expected)
    const oldDate = tc.expiryDate
    Object.assign(tc, { expiryDate: newDate, rev: (tc.rev ?? 0) + 1, activeUser: presenceOf(actor), updatedAt: new Date().toISOString() })
    save(STORAGE_KEYS.testCases, list)
    return { testCase: tc, oldDate }
  })

/** the case and, for a parent, its sub-cases */
const withSubs = (list: TestCase[], projectId: string, id: string) =>
  list.filter((x) => x.projectId === projectId && (x.id === id || x.parentId === id))

/**
 * POST /projects/:projectId/test-cases/:id/archive (with its sub-cases)
 * The default way to remove a case: it keeps its id (never reused while archived) and every
 * run result, defect and audit entry stays attached, so it can be restored.
 */
export const archiveTestCase = (projectId: string, id: string, actor: Actor, expected?: CaseExpectation) =>
  respond(() => {
    assertCan('case.archive', projectId)
    const list = testCases()
    const target = list.find((x) => sameCase(x, projectId, id))
    if (!target) throw new ApiError(`ไม่พบ ${id}`, 404)
    assertFresh(target, expected)
    if (target.archivedAt) throw new ApiError(`${id} อยู่ในคลังเก็บแล้ว`, 409)
    const now = new Date().toISOString()
    const archived = withSubs(list, projectId, id).filter((x) => !x.archivedAt)
    archived.forEach((x) => Object.assign(x, { archivedAt: now, archivedBy: actor.name, activeUser: null, rev: (x.rev ?? 0) + 1 }))
    save(STORAGE_KEYS.testCases, list)
    return archived
  })

/** POST /projects/:projectId/test-cases/:id/restore (with the sub-cases archived together with it) */
export const restoreTestCase = (projectId: string, id: string, expected?: CaseExpectation) =>
  respond(() => {
    assertCan('case.archive', projectId)
    const list = testCases()
    const target = list.find((x) => sameCase(x, projectId, id))
    if (!target) throw new ApiError(`ไม่พบ ${id}`, 404)
    assertFresh(target, expected)
    if (!target.archivedAt) throw new ApiError(`${id} ไม่ได้อยู่ในคลังเก็บ`, 409)
    const parent = target.parentId ? list.find((x) => sameCase(x, projectId, target.parentId!)) : undefined
    if (parent?.archivedAt) throw new ApiError(`กู้คืนเคสหลัก ${parent.id} ก่อน`, 409)
    const restored = withSubs(list, projectId, id).filter((x) => x.archivedAt === target.archivedAt)
    restored.forEach((x) => {
      delete x.archivedAt
      delete x.archivedBy
      x.rev = (x.rev ?? 0) + 1
    })
    save(STORAGE_KEYS.testCases, list)
    return restored
  })

/** GET /projects/:projectId/test-cases/:id/impact (what archiving or deleting it, with its sub-cases, touches) */
export const caseImpact = (projectId: string, id: string) =>
  respond<TestCaseImpact>(() => {
    assertCan('case.view', projectId)
    const list = testCases()
    const cases = withSubs(list, projectId, id)
    if (!cases.length) throw new ApiError(`ไม่พบ ${id}`, 404)
    const ids = cases.map((x) => x.id)
    const remaining = list.filter((x) => x.projectId === projectId && !x.archivedAt && !ids.includes(x.id))
    return {
      caseIds: ids,
      runs: runsOf(projectId)
        .filter((r) => r.results.some((x) => ids.includes(x.caseId) && !x.caseDeleted))
        .map((r) => ({ name: r.name, round: r.round, open: r.status !== 'completed' })),
      openDefects: defectsOf(projectId)
        .filter((d) => d.caseId && ids.includes(d.caseId) && !d.caseDeleted && isOpenDefect(d))
        .map((d) => ({ id: d.id, title: d.title })),
      requirements: requirementsOf(projectId)
        .filter((r) => casesForRequirement(r, cases).length)
        .map((r) => ({ code: r.code, title: r.title, uncovered: !casesForRequirement(r, remaining).length })),
    }
  })

/**
 * DELETE /projects/:projectId/test-cases/:id (and its sub-cases): permanent, archived cases only.
 * Ids are reused later (new cases, renumbering), so everything that pointed at the deleted
 * cases is detached: run results and defects keep the old id as history only, alerts lose the link.
 * Returns the deleted ids.
 */
export const deleteTestCase = (projectId: string, id: string, expected?: CaseExpectation) =>
  respond(() => {
    assertCan('case.delete', projectId)
    const list = testCases()
    const target = list.find((x) => sameCase(x, projectId, id))
    if (!target) throw new ApiError(`ไม่พบ ${id}`, 404)
    assertFresh(target, expected)
    if (!target.archivedAt) throw new ApiError(`เก็บ ${id} เข้าคลังก่อน จึงลบถาวรได้`, 409)
    const ids = withSubs(list, projectId, id).map((x) => x.id)
    detachRunCases(projectId, ids)
    detachDefectCases(projectId, ids)
    detachNotificationCases(projectId, ids)
    detachAuditCases(projectId, ids)
    save(
      STORAGE_KEYS.testCases,
      list.filter((x) => !(x.projectId === projectId && ids.includes(x.id))),
    )
    return ids
  })

/**
 * PUT /projects/:projectId/test-cases/order (the active cases, as shown in the list)
 * Renumbers ids in the given order (TC-101, TC-102 … and TC-101-1, TC-101-2 …), archived cases
 * after the active ones (archived sub-cases after their parent's active ones), and
 * re-keys every record that points at a case (run results, defects, notifications,
 * audit entries), so they keep pointing at the same case after its id changes.
 */
export const reorderTestCases = (projectId: string, order: TestCaseOrder[], uids?: Record<string, string>) =>
  respond<TestCaseReorderResult>(() => {
    assertCan('case.reorder', projectId)
    const list = testCases()
    const mine = list.filter((x) => x.projectId === projectId)
    const taken = new Set<string>()
    const renames: Record<string, string> = {}
    const renumber = (oldId: string, id: string, numericId: number, parentId: string | null): TestCase => {
      const tc = mine.find((x) => x.id === oldId)
      if (!tc || taken.has(oldId)) throw new ApiError(`ไม่พบ ${oldId} กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง`, 409)
      // the order was made from a list someone else has renumbered since
      if (uids?.[oldId] && tc.uid && uids[oldId] !== tc.uid) {
        throw new ApiError('มีผู้อื่นจัดลำดับ Test Case ไปแล้ว โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง', 409, 'stale')
      }
      taken.add(oldId)
      if (oldId === id) return { ...tc, numericId, parentId }
      renames[oldId] = id
      return { ...tc, id, numericId, parentId, rev: (tc.rev ?? 0) + 1 }
    }
    const subsOf = (parentId: string) => mine.filter((x) => x.parentId === parentId)
    const full: TestCaseOrder[] = [
      ...order.map((o) => ({
        id: o.id,
        subIds: [
          ...o.subIds,
          ...subsOf(o.id)
            .filter((x) => x.archivedAt)
            .map((x) => x.id),
        ],
      })),
      ...mine.filter((x) => !x.parentId && x.archivedAt).map((p) => ({ id: p.id, subIds: subsOf(p.id).map((x) => x.id) })),
    ]
    const cases = full.flatMap(({ id: oldId, subIds }, p) => {
      const numericId = 101 + p
      const id = `TC-${numericId}`
      return [renumber(oldId, id, numericId, null), ...subIds.map((subId, s) => renumber(subId, `${id}-${s + 1}`, numericId, id))]
    })
    // a case was added elsewhere since the page loaded: refuse rather than drop it
    if (cases.length !== mine.length) throw new ApiError('รายการ Test Case เปลี่ยนไประหว่างจัดลำดับ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 409)

    if (Object.keys(renames).length) {
      renameRunCases(projectId, renames)
      renameDefectCases(projectId, renames)
      renameNotificationCases(projectId, renames)
      renameAuditCases(projectId, renames)
    }
    save(STORAGE_KEYS.testCases, [...cases, ...list.filter((x) => x.projectId !== projectId)])
    return { cases, renames }
  })
