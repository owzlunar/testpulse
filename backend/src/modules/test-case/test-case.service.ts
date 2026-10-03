import type { ClientSession } from 'mongoose'
import type {
  ActiveUserPresence,
  AuditChange,
  CaseExpectation,
  NotificationAudience,
  PermissionKey,
  ProjectStats,
  Requirement,
  RoleDiscipline,
  TestCase,
  TestCaseImpact,
  TestCaseInput,
  TestCaseOrder,
  TestCaseReorderResult,
  TestCaseReviewFlag,
  TestCaseUpdateResult,
  TestCaseVersionRecord,
} from '#contract/types.js'
import { casesForRequirement } from '#contract/rules/requirement.js'
import { STATUS_LABELS, caseStatsOf, hasSpecChanges, nextVersion, specDiff, specOf, withEffectiveLinks } from '#contract/rules/test-case.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { assertCan } from '#core/auth/guards.js'
import { can, type Principal } from '#core/auth/principal.js'
import { transaction } from '#core/database/transaction.js'
import { emit } from '#core/events/event-bus.js'
import { ApiError } from '#core/http/errors.js'
import { notify } from '#core/notify/notify-sink.js'
import { projectAccess } from '#modules/project/index.js'
import { requirements } from '#modules/requirement/index.js'
import { accounts } from '#modules/user/index.js'
import { testCaseRepository, type TestCaseData } from './test-case.repository.js'

declare module '#core/events/event-bus.js' {
  interface DomainEvents {
    /** a reorder renumbered cases (same transaction): modules re-key what points at them (old id -> new id) */
    'test-case.renamed': { projectId: string; renames: Record<string, string>; session: ClientSession }
    /** cases were deleted for good: their ids will be reused, so whatever pointed at them lets go */
    'test-case.deleted': { projectId: string; ids: string[] }
    /** what archiving / deleting these cases touches: handlers return parts of TestCaseImpact (runs, open defects) */
    'test-case.impact': { projectId: string; ids: string[] }
  }
}

/** what the person a change is from looks like on the case ("editing now") */
type Actor = Pick<Principal, 'id' | 'name'>

const notFound = (id: string) => ApiError.notFound(`ไม่พบ ${id}`)
const archivedError = (id: string) => ApiError.conflict(`${id} อยู่ในคลังเก็บ กู้คืนก่อนจึงแก้ไขได้`)
const now = () => new Date().toISOString()
const thaiDateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function presenceOf(actor: Actor): Promise<ActiveUserPresence> {
  const user = await accounts.findById(actor.id)
  return { id: actor.id, name: actor.name, avatar: user?.avatar ?? '', action: 'editing' }
}

/** case.* permission and access to the project */
async function guard(p: Principal, projectId: string, need: PermissionKey | PermissionKey[]) {
  assertCan(p, need)
  await projectAccess.assert(p, projectId)
}

async function found(projectId: string, id: string, session?: ClientSession): Promise<TestCase> {
  const tc = await testCaseRepository.findCase(projectId, id, session)
  if (!tc) throw notFound(id)
  return tc
}

/**
 * Refuse (409, code 'stale') a change based on an outdated copy of the case: another user saved it
 * since (rev), or the list was renumbered and this id now belongs to another case (uid).
 * Without an expectation (internal calls) nothing is checked.
 */
export function assertFresh(tc: TestCase, expected?: CaseExpectation): void {
  if (!expected) return
  if (tc.uid && expected.uid !== tc.uid) {
    throw ApiError.conflict(`รหัส ${tc.id} เป็นของอีกเคสแล้ว (มีการจัดลำดับใหม่) โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง`, 'stale')
  }
  if ((tc.rev ?? 0) !== expected.rev) {
    const by = tc.activeUser?.name ?? 'ผู้ใช้อื่น'
    throw ApiError.conflict(
      `${tc.id} ถูกแก้ไขโดย ${by} เมื่อ ${thaiDateTime(tc.updatedAt)} หลังจากที่คุณเปิดดู โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง`,
      'stale',
    )
  }
}

/**
 * Rules for changing a case:
 * - a version is a change to what is tested (hasSpecChanges) or an asked-for major bump;
 *   status / due date / assignee changes stay in the audit trail
 * - a pass only proves the spec it ran against: changing the spec of a passed case sends it back to ready_for_test
 * - every bounce between Dev and QA counts as one churn round
 * - id, project and parent can't be changed by a patch
 */
export function applyCasePatch(
  old: TestCase,
  patch: Partial<TestCaseInput>,
  actor: ActiveUserPresence,
  projectRequirements: Requirement[],
): TestCaseUpdateResult {
  const { changeSummary, bumpMajor, ...updates } = patch
  const specChanged = hasSpecChanges(old, updates, projectRequirements)
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
    timestamp: now(),
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
    activeUser: actor,
    // editing the spec is the review a changed requirement asks for
    reviewNeeded: specChanged ? undefined : old.reviewNeeded,
    createdAt: old.createdAt,
    updatedAt: now(),
  }
  return { testCase, before: old, statusChanged: status !== old.status, newVersion, passInvalidated }
}

/** what a stored write sets: the case without its identity / timestamps (reviewNeeded may be dropped) */
function dataOf(tc: TestCase): Partial<TestCaseData> {
  const { uid: _uid, createdAt: _c, updatedAt: _u, reviewNeeded, ...data } = tc
  return reviewNeeded ? { ...data, reviewNeeded } : data
}

async function save(tc: TestCase, session?: ClientSession): Promise<TestCase> {
  const saved = await testCaseRepository.write(tc.uid!, dataOf(tc), session)
  if (!tc.reviewNeeded && saved.reviewNeeded) {
    await testCaseRepository.unset(tc.uid!, ['reviewNeeded'], session)
    delete saved.reviewNeeded
  }
  return saved
}

/**
 * What a patch needs: Dev hand-off (ready_for_test) needs case.handoff, verdicts need run.execute,
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

// --- who hears about it ------------------------------------------------------------------------

/**
 * Who hears about a case: its assigned QA and / or developer; when nobody on that side is assigned,
 * everyone on that side (discipline). Project-wide news (new / archived cases) has no audience.
 */
export async function audienceOf(tc: TestCase, sides: RoleDiscipline[] = ['qa', 'dev']): Promise<NotificationAudience> {
  const names = [sides.includes('qa') ? tc.assignedTo : undefined, sides.includes('dev') ? tc.assignedDev : undefined].filter((n): n is string => !!n)
  const ids = await accounts.idsByName(names)
  return ids.length ? { userIds: ids } : { disciplines: sides }
}

const caseAudit = (tc: TestCase, action: Parameters<typeof recordAudit>[0]['action'], details: string, changes?: AuditChange[]) =>
  recordAudit({
    action,
    targetType: 'TEST_CASE',
    targetId: tc.id,
    projectId: tc.projectId,
    targetTitle: tc.name,
    details,
    ...(changes ? { changes } : {}),
  })

/** the audit entry and notifications of a case change (also run verdicts, later) */
async function announceUpdate({ testCase: tc, before: old, statusChanged, newVersion, passInvalidated }: TestCaseUpdateResult, actor: Actor) {
  const changes: AuditChange[] = []
  if (statusChanged) changes.push({ field: 'status', oldValue: old.status, newValue: tc.status })
  if (tc.name !== old.name) changes.push({ field: 'name', oldValue: old.name, newValue: tc.name })
  if (tc.actualResults && tc.actualResults !== old.actualResults)
    changes.push({ field: 'actualResults', oldValue: old.actualResults, newValue: tc.actualResults })
  if (tc.rootCauseTag && tc.rootCauseTag !== old.rootCauseTag)
    changes.push({ field: 'rootCauseTag', oldValue: old.rootCauseTag, newValue: tc.rootCauseTag })
  const details = [
    newVersion && `${old.version} → ${tc.version}`,
    passInvalidated
      ? 'แก้ไขข้อกำหนดหลังผ่านการทดสอบ สถานะกลับเป็นพร้อมให้ทดสอบ'
      : statusChanged
        ? `เปลี่ยนสถานะเป็น ${STATUS_LABELS[tc.status]}`
        : 'อัปเดตรายละเอียดของ Test Case',
  ]
    .filter(Boolean)
    .join(' · ')
  await caseAudit(tc, statusChanged ? 'STATUS_CHANGE' : 'UPDATE', details, changes)

  const base = { projectId: tc.projectId, testCaseId: tc.id }
  if (!statusChanged) {
    await notify({
      ...base,
      to: await audienceOf(tc),
      type: 'MODIFIED',
      title: 'มีการแก้ไข Test Case',
      message: `${tc.id}: "${tc.name}" ได้รับการแก้ไข`,
      severity: 'info',
    })
  } else if (passInvalidated) {
    await notify({
      ...base,
      to: await audienceOf(tc, ['qa']),
      type: 'STATUS_CHANGED',
      title: 'Test Case ต้องทดสอบใหม่',
      message: `${tc.id}: "${tc.name}" ถูกแก้ไขเป็น ${tc.version} หลังผ่านการทดสอบ ผลเดิมถูกยกเลิก`,
      severity: 'warning',
    })
  } else if (tc.status === 'ready_for_test') {
    await notify({
      ...base,
      to: await audienceOf(tc, ['qa']),
      type: 'STATUS_CHANGED',
      title: 'Dev ส่งมอบงาน พร้อมให้ทดสอบ',
      message: `${tc.id}: "${tc.name}" ส่งมอบโดย ${actor.name} รอ QA ตรวจสอบ`,
      severity: 'info',
    })
  } else if (tc.status === 'failed') {
    await notify({
      ...base,
      to: await audienceOf(tc, ['dev']),
      type: 'STATUS_CHANGED',
      title: 'Test Case ไม่ผ่านการทดสอบ',
      message: `${tc.id}: "${tc.name}" ไม่ผ่าน แจ้งเตือน ${tc.assignedDev || 'ทีม Dev'} ให้ตรวจสอบและแก้ไข`,
      severity: 'error',
    })
  } else {
    await notify({
      ...base,
      to: await audienceOf(tc),
      type: 'STATUS_CHANGED',
      title: 'สถานะ Test Case เปลี่ยนแปลง',
      message: `${tc.id}: ${STATUS_LABELS[old.status]} → ${STATUS_LABELS[tc.status]}`,
      severity: tc.status === 'passed' ? 'success' : 'warning',
    })
  }
}

/** load, patch (applyCasePatch) and save one case; the change is announced (audit, notifications) */
async function patchCase(projectId: string, id: string, patch: Partial<TestCaseInput>, actor: Actor, expected?: CaseExpectation) {
  const old = await found(projectId, id)
  assertFresh(old, expected)
  if (old.archivedAt) throw archivedError(id)
  const result = applyCasePatch(old, patch, await presenceOf(actor), await requirements.ofProject(projectId))
  result.testCase = await save(result.testCase)
  await announceUpdate(result, actor)
  return result
}

/** the case and, for a parent, its sub-cases */
const withSubs = (list: TestCase[], id: string) => list.filter((x) => x.id === id || x.parentId === id)

// --- the API ------------------------------------------------------------------------------------

/** a new case as sent by the client: the server owns its version, history and review / archive state */
export type NewCaseInput = Omit<
  TestCaseInput,
  'projectId' | 'version' | 'versionHistory' | 'archivedAt' | 'archivedBy' | 'reviewNeeded' | 'churnCount'
> & {
  version?: string
}

export const testCaseService = {
  /** GET /projects/:projectId/test-cases (archived included, list order) */
  async list(p: Principal, projectId: string): Promise<TestCase[]> {
    await guard(p, projectId, 'case.view')
    return testCaseRepository.ofProject(projectId)
  },

  /** GET /test-cases?search=:q: active cases of every project the user may open (id, name, requirement, scenario) */
  async search(p: Principal, q: string, limit: number): Promise<{ cases: TestCase[]; total: number }> {
    const text = q.trim()
    if (!text || !p.roleId || !can(p, 'case.view')) return { cases: [], total: 0 }
    const projectIds = [...(await projectAccess.accessibleIds(p))]
    const pattern = new RegExp(escapeRegex(text), 'i')
    // the requirement a case shows includes its linked requirements' codes and titles
    const linked: string[] = []
    for (const projectId of projectIds) {
      for (const r of await requirements.ofProject(projectId)) if (pattern.test(`${r.code}: ${r.title}`)) linked.push(r.id)
    }
    return testCaseRepository.searchActive(
      projectIds,
      { $or: [{ id: pattern }, { name: pattern }, { requirement: pattern }, { testScenario: pattern }, { requirementIds: { $in: linked } }] },
      limit,
    )
  },

  /**
   * POST /projects/:projectId/test-cases (one, or several for import / AI drafts)
   * The server builds each case (v1.0, first history entry) and gives inputs without an id the next
   * TC number; a given id (a sub-case) must be free in the project. New cases go to the end of the list.
   */
  async create(p: Principal, projectId: string, inputs: NewCaseInput[]): Promise<TestCase[]> {
    await guard(p, projectId, 'case.edit')
    const presence = await presenceOf(p)
    const created = await transaction(async (session) => {
      let { numericId: last, position } = await testCaseRepository.lastNumbers(projectId, session)
      const made: TestCase[] = []
      for (const input of inputs) {
        const { version: _v, ...data } = input
        const given = data.id?.trim()
        const numericId = given ? data.numericId : ++last
        const id = given || `TC-${numericId}`
        if (made.some((x) => x.id === id) || (await testCaseRepository.findCase(projectId, id, session))) {
          throw ApiError.conflict(`รหัส ${id} มีอยู่แล้วในโปรเจกต์นี้`, 'duplicate')
        }
        const record: TestCaseVersionRecord = {
          version: 'v1.0',
          updatedBy: p.name,
          timestamp: now(),
          changeSummary: 'สร้าง Test Case ครั้งแรก',
          status: data.status,
          snapshot: specOf(data),
        }
        made.push(
          await testCaseRepository.create(
            {
              ...data,
              id,
              numericId,
              projectId,
              parentId: data.parentId ?? null,
              version: 'v1.0',
              versionHistory: [record],
              rev: 1,
              activeUser: presence,
              position: ++position,
            },
            session,
          ),
        )
      }
      return made
    })

    if (created.length === 1) {
      const tc = created[0]!
      const isSub = !!tc.parentId
      await caseAudit(
        tc,
        isSub ? 'ADD_SUBCASE' : 'CREATE',
        isSub ? `สร้าง Sub-case ภายใต้ ${tc.parentId} (${tc.version})` : `สร้าง Test Case ${tc.id} - ${tc.name} (${tc.version})`,
      )
      await notify({
        type: 'MODIFIED',
        title: isSub ? 'เพิ่ม Sub-case ใหม่' : 'สร้าง Test Case ใหม่',
        message: `${tc.id}: "${tc.name}" (${tc.version})`,
        projectId,
        testCaseId: tc.id,
        severity: 'info',
      })
      if (tc.status === 'pending') {
        await notify({
          type: 'STATUS_CHANGED',
          title: 'มี Test Case ใหม่รอ Dev พัฒนา',
          to: await audienceOf(tc, ['dev']),
          message: `${tc.id}: "${tc.name}" ${tc.assignedDev ? `มอบหมายให้ ${tc.assignedDev}` : 'รอ Developer รับงาน'} เมื่อเสร็จให้กด "ส่งมอบพร้อมเทส"`,
          projectId,
          testCaseId: tc.id,
          severity: 'info',
        })
      }
    } else if (created.length) {
      const range = `${created[0]!.id} – ${created.at(-1)!.id}`
      await recordAudit({
        action: 'CREATE',
        targetType: 'PROJECT',
        targetId: projectId,
        projectId,
        targetTitle: `เพิ่ม ${created.length} เคส`,
        details: `เพิ่ม Test Case ${created.length} รายการ (${range})`,
      })
      await notify({
        type: 'MODIFIED',
        title: `เพิ่ม Test Case ${created.length} รายการ`,
        message: `${range} พร้อมให้ตรวจทาน`,
        projectId,
        severity: 'success',
      })
    }
    return created
  },

  /** PATCH /projects/:projectId/test-cases/:id (versioned: see applyCasePatch; `expected`: see assertFresh) */
  async update(
    p: Principal,
    projectId: string,
    id: string,
    patch: Partial<TestCaseInput>,
    expected?: CaseExpectation,
  ): Promise<TestCaseUpdateResult> {
    await guard(p, projectId, patchPermissions(patch, (await testCaseRepository.findCase(projectId, id)) ?? undefined))
    return patchCase(projectId, id, patch, p, expected)
  },

  /**
   * POST /projects/:projectId/test-cases/:id/versions/:version/restore
   * Brings back the spec of an earlier version as a new version (same rules as an edit: a passed case
   * must be tested again). Images stay as they are (they are not kept in history).
   */
  async restoreVersion(p: Principal, projectId: string, id: string, version: string, expected?: CaseExpectation): Promise<TestCaseUpdateResult> {
    await guard(p, projectId, 'case.restoreVersion')
    const tc = await found(projectId, id)
    assertFresh(tc, expected)
    const snapshot = tc.versionHistory?.find((r) => r.version === version)?.snapshot
    if (!snapshot) throw ApiError.notFound(`${version} ไม่มีเนื้อหาที่บันทึกไว้ให้กู้คืน`)
    const projectRequirements = await requirements.ofProject(projectId)
    if (!specDiff(snapshot, tc, projectId, projectRequirements).length) throw ApiError.conflict(`เนื้อหาของ ${version} เหมือนเวอร์ชันปัจจุบันแล้ว`)
    // keep the links the old text resolved to, rather than dropping explicit links
    const spec = specOf(withEffectiveLinks(snapshot, projectId, projectRequirements))
    return patchCase(projectId, id, { ...spec, changeSummary: `กู้คืนเนื้อหาจาก ${version}` }, p)
  },

  /** POST /projects/:projectId/test-cases/:id/review (reviewed against the changed requirement: nothing to change) */
  async markReviewed(
    p: Principal,
    projectId: string,
    id: string,
    expected?: CaseExpectation,
  ): Promise<{ testCase: TestCase; cleared: TestCaseReviewFlag }> {
    await guard(p, projectId, 'case.edit')
    const tc = await found(projectId, id)
    assertFresh(tc, expected)
    if (!tc.reviewNeeded) throw ApiError.conflict(`${id} ไม่มีรายการที่ต้องทบทวน`)
    const cleared = tc.reviewNeeded
    const testCase = await save({ ...tc, reviewNeeded: undefined, rev: (tc.rev ?? 0) + 1, activeUser: await presenceOf(p) })
    await caseAudit(testCase, 'UPDATE', `ทบทวนตาม ${cleared.requirementCodes.join(', ')} แล้ว ไม่ต้องแก้ไขเคส`)
    return { testCase, cleared }
  },

  /** PATCH /projects/:projectId/test-cases/:id/due-date (reason required; a due date is not part of the spec: no new version) */
  async extendDueDate(p: Principal, projectId: string, id: string, newDate: string, reason: string, expected?: CaseExpectation) {
    await guard(p, projectId, ['case.edit', 'case.handoff'])
    if (!reason.trim()) throw ApiError.unprocessable('ต้องระบุเหตุผลในการขยายเวลา')
    const tc = await found(projectId, id)
    if (tc.archivedAt) throw archivedError(id)
    assertFresh(tc, expected)
    const oldDate = tc.expiryDate
    const testCase = await save({ ...tc, expiryDate: newDate, rev: (tc.rev ?? 0) + 1, activeUser: await presenceOf(p) })
    const shown = oldDate || '-'
    await caseAudit(testCase, 'EXTEND_DUE_DATE', `ขยายกำหนดส่งจาก ${shown} เป็น ${newDate} (เหตุผล: ${reason})`, [
      { field: 'expiryDate', oldValue: shown, newValue: newDate },
    ])
    await notify({
      type: 'MODIFIED',
      title: 'ขยายกำหนดส่งมอบ',
      to: await audienceOf(testCase),
      message: `${testCase.id}: เลื่อนเป็น ${newDate} โดย ${p.name} — ${reason}`,
      projectId,
      testCaseId: testCase.id,
      severity: 'info',
    })
    return { testCase, oldDate }
  },

  /**
   * POST /projects/:projectId/test-cases/:id/archive (with its sub-cases)
   * The default way to remove a case: it keeps its id (never reused while archived) and every run
   * result, defect and audit entry stays attached, so it can be restored.
   */
  async archive(p: Principal, projectId: string, id: string, expected?: CaseExpectation): Promise<TestCase[]> {
    await guard(p, projectId, 'case.archive')
    const list = await testCaseRepository.ofProject(projectId)
    const target = list.find((x) => x.id === id)
    if (!target) throw notFound(id)
    assertFresh(target, expected)
    if (target.archivedAt) throw ApiError.conflict(`${id} อยู่ในคลังเก็บแล้ว`)
    const at = now()
    const archived = await testCaseRepository.writeMany(
      withSubs(list, id)
        .filter((x) => !x.archivedAt)
        .map((x) => ({ uid: x.uid!, data: { archivedAt: at, archivedBy: p.name, activeUser: null, rev: (x.rev ?? 0) + 1 } })),
    )
    const subs = archived.slice(1).map((c) => c.id)
    await caseAudit(target, 'ARCHIVE', subs.length ? `เก็บ ${id} เข้าคลัง รวมถึง Sub-case ${subs.join(', ')}` : `เก็บ ${id} เข้าคลัง`)
    await notify({
      type: 'MODIFIED',
      title: 'เก็บ Test Case เข้าคลัง',
      message: `${id}: "${target.name}" ถูกเก็บเข้าคลัง กู้คืนได้`,
      projectId,
      severity: 'warning',
    })
    return archived
  },

  /** POST /projects/:projectId/test-cases/:id/restore (with the sub-cases archived together with it) */
  async restore(p: Principal, projectId: string, id: string, expected?: CaseExpectation): Promise<TestCase[]> {
    await guard(p, projectId, 'case.archive')
    const list = await testCaseRepository.ofProject(projectId)
    const target = list.find((x) => x.id === id)
    if (!target) throw notFound(id)
    assertFresh(target, expected)
    if (!target.archivedAt) throw ApiError.conflict(`${id} ไม่ได้อยู่ในคลังเก็บ`)
    const parent = target.parentId ? list.find((x) => x.id === target.parentId) : undefined
    if (parent?.archivedAt) throw ApiError.conflict(`กู้คืนเคสหลัก ${parent.id} ก่อน`)
    const restored: TestCase[] = []
    for (const x of withSubs(list, id).filter((c) => c.archivedAt === target.archivedAt)) {
      await testCaseRepository.unset(x.uid!, ['archivedAt', 'archivedBy'])
      restored.push(await testCaseRepository.write(x.uid!, { rev: (x.rev ?? 0) + 1 }))
    }
    const subs = restored.slice(1).map((c) => c.id)
    await caseAudit(target, 'RESTORE', subs.length ? `กู้คืน ${id} พร้อม Sub-case ${subs.join(', ')}` : `กู้คืน ${id}`)
    return restored
  },

  /** GET /projects/:projectId/test-cases/:id/impact (what archiving or deleting it, with its sub-cases, touches) */
  async impact(p: Principal, projectId: string, id: string): Promise<TestCaseImpact> {
    await guard(p, projectId, 'case.view')
    const list = await testCaseRepository.ofProject(projectId)
    const cases = withSubs(list, id)
    if (!cases.length) throw notFound(id)
    const ids = cases.map((x) => x.id)
    const remaining = list.filter((x) => !x.archivedAt && !ids.includes(x.id))
    const parts = (await emit('test-case.impact', { projectId, ids })) as Partial<Pick<TestCaseImpact, 'runs' | 'openDefects'>>[]
    return {
      caseIds: ids,
      runs: parts.flatMap((x) => x.runs ?? []),
      openDefects: parts.flatMap((x) => x.openDefects ?? []),
      requirements: (await requirements.ofProject(projectId))
        .filter((r) => casesForRequirement(r, cases).length)
        .map((r) => ({ code: r.code, title: r.title, uncovered: !casesForRequirement(r, remaining).length })),
    }
  },

  /**
   * DELETE /projects/:projectId/test-cases/:id (and its sub-cases): permanent, archived cases only.
   * Ids are reused later (new cases, renumbering), so whatever pointed at the deleted cases lets go
   * ('test-case.deleted'). Returns the deleted ids.
   */
  async remove(p: Principal, projectId: string, id: string, expected?: CaseExpectation): Promise<string[]> {
    await guard(p, projectId, 'case.delete')
    const list = await testCaseRepository.ofProject(projectId)
    const target = list.find((x) => x.id === id)
    if (!target) throw notFound(id)
    assertFresh(target, expected)
    if (!target.archivedAt) throw ApiError.conflict(`เก็บ ${id} เข้าคลังก่อน จึงลบถาวรได้`)
    const ids = withSubs(list, id).map((x) => x.id)
    await testCaseRepository.deleteCases(projectId, ids)
    await emit('test-case.deleted', { projectId, ids })
    await recordAudit({
      action: 'DELETE',
      targetType: 'TEST_CASE',
      targetId: id,
      projectId,
      targetDeleted: true,
      targetTitle: target.name,
      details: ids.length > 1 ? `ลบถาวร ${id} รวมถึง Sub-case ${ids.slice(1).join(', ')}` : `ลบถาวร ${id}`,
    })
    await notify({ type: 'MODIFIED', title: 'ลบ Test Case ถาวร', message: `${id}: "${target.name}" ถูกลบออกจากระบบ`, projectId, severity: 'warning' })
    return ids
  },

  /**
   * PUT /projects/:projectId/test-cases/order (the active cases, as shown in the list)
   * Renumbers ids in the given order (TC-101, TC-102 … and TC-101-1, TC-101-2 …), archived cases
   * after the active ones (archived sub-cases after their parent's active ones), and has every
   * record that points at a case re-keyed ('test-case.renamed'), all in one transaction.
   */
  async reorder(p: Principal, projectId: string, order: TestCaseOrder[], uids?: Record<string, string>): Promise<TestCaseReorderResult> {
    await guard(p, projectId, 'case.reorder')
    const result = await transaction(async (session) => {
      const mine = await testCaseRepository.ofProject(projectId, session)
      const taken = new Set<string>()
      const renames: Record<string, string> = {}
      const changes: { uid: string; data: Partial<TestCaseData> }[] = []
      let position = 0
      const renumber = (oldId: string, id: string, numericId: number, parentId: string | null): TestCase => {
        const tc = mine.find((x) => x.id === oldId)
        if (!tc || taken.has(oldId)) throw ApiError.conflict(`ไม่พบ ${oldId} กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง`)
        // the order was made from a list someone else has renumbered since
        if (uids?.[oldId] && uids[oldId] !== tc.uid)
          throw ApiError.conflict('มีผู้อื่นจัดลำดับ Test Case ไปแล้ว โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง', 'stale')
        taken.add(oldId)
        const rev = oldId === id ? (tc.rev ?? 0) : (tc.rev ?? 0) + 1
        if (oldId !== id) renames[oldId] = id
        changes.push({ uid: tc.uid!, data: { id, numericId, parentId, rev, position: ++position } })
        return { ...tc, id, numericId, parentId, rev }
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
        ...mine.filter((x) => !x.parentId && x.archivedAt).map((x) => ({ id: x.id, subIds: subsOf(x.id).map((s) => s.id) })),
      ]
      const cases = full.flatMap(({ id: oldId, subIds }, i) => {
        const numericId = 101 + i
        const id = `TC-${numericId}`
        return [renumber(oldId, id, numericId, null), ...subIds.map((subId, s) => renumber(subId, `${id}-${s + 1}`, numericId, id))]
      })
      // a case was added elsewhere since the page loaded: refuse rather than drop it
      if (cases.length !== mine.length) throw ApiError.conflict('รายการ Test Case เปลี่ยนไประหว่างจัดลำดับ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง')
      await testCaseRepository.renumber(changes, session)
      if (Object.keys(renames).length) await emit('test-case.renamed', { projectId, renames, session })
      return { cases: await testCaseRepository.ofProject(projectId, session), renames }
    })
    const moved = Object.entries(result.renames).map(([from, to]) => `${from} → ${to}`)
    await recordAudit({
      action: 'UPDATE',
      targetType: 'PROJECT',
      targetId: projectId,
      projectId,
      targetTitle: 'จัดลำดับ Test Case',
      details: moved.length ? `จัดลำดับ Test Case และเปลี่ยนรหัส: ${moved.join(', ')}` : 'จัดลำดับ Test Case (รหัสไม่เปลี่ยน)',
    })
    return result
  },

  // --- for other modules / events -----------------------------------------------------------------

  /** a requirement changed or went away: flag the active cases that test it (QA reviews them); returns them */
  async flagForReview(requirement: Requirement, reason: string): Promise<TestCase[]> {
    const since = now()
    const flagged = casesForRequirement(requirement, await testCaseRepository.activeOfProject(requirement.projectId))
    const saved: TestCase[] = []
    for (const tc of flagged) {
      const codes = [...new Set([...(tc.reviewNeeded?.requirementCodes ?? []), requirement.code])]
      saved.push(await testCaseRepository.write(tc.uid!, { reviewNeeded: { requirementCodes: codes, reason, since }, rev: (tc.rev ?? 0) + 1 }))
    }
    return saved
  },

  /** active case counts of each project (project cards) */
  async statsOf(projectIds: string[]): Promise<Map<string, ProjectStats>> {
    const cases = await testCaseRepository.activeForStats(projectIds)
    return new Map(projectIds.map((id) => [id, caseStatsOf(cases.filter((c) => c.projectId === id) as TestCase[])]))
  },

  removeOfProject: async (projectId: string) => {
    await testCaseRepository.deleteOfProject(projectId)
  },
}
