// =============================================================================
// UI types (Fox theme)
// =============================================================================

/** Theme color names usable as `color="..."` / `text-*` / `bg-*` */
export type Tone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'caution' | 'error'

/** A value with its Thai label, theme tone and icon (statuses, priorities, roles, ...) */
export interface Option<T extends string = string> {
  value: T
  label: string
  tone: Tone
  icon: string
  /** short Thai explanation shown in menus */
  hint?: string
}

export type PermissionKey = keyof Omit<RolePermission, 'role' | 'name' | 'description'>

export type NavItem =
  | { header: string; permission?: PermissionKey }
  | { title: string; icon: string; to: string; badge?: string; permission?: PermissionKey }

export interface Breadcrumb {
  title: string
  to?: string
}

export interface ChartSeries {
  name: string
  tone: Tone
  data: number[]
}

export interface ChartSegment {
  label: string
  value: number
  tone: Tone
}

export interface LegendItem {
  label: string
  tone: Tone
}

export interface TimelineItem {
  time: string
  text: string
  tone?: Tone
  /** linked text appended after `text` */
  highlight?: string
}

/** Event shown by FoxCalendar. `data` carries the domain object for custom rendering. */
export interface CalendarEvent<T = unknown> {
  id: string
  title: string
  /** 'YYYY-MM-DD' (all-day) or 'YYYY-MM-DDTHH:mm' */
  start: string
  /** all-day ends are exclusive (FullCalendar convention) */
  end?: string | null
  allDay?: boolean
  tone: Tone
  editable?: boolean
  data?: T
}

/** Emitted by FoxCalendar after drag & drop. Call `revert()` to undo the move on screen. */
export interface CalendarEventChange {
  id: string
  start: string
  end: string | null
  allDay: boolean
  revert: () => void
}

/** Vuetify field rule */
export type Rule = (value: any) => true | string

// =============================================================================
// Domain types (TestPulse)
// =============================================================================

export type TestCaseStatus = 'pending' | 'ready_for_test' | 'untested' | 'in_progress' | 'passed' | 'failed' | 'blocked'
export type TestCasePriority = 'low' | 'medium' | 'high' | 'critical'
export type UserRole = 'ADMIN' | 'DEV' | 'QA'
export type ProjectStatus = 'active' | 'in_review' | 'completed' | 'archived'
export type MilestoneType = 'code_freeze' | 'uat_signoff' | 'go_live'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  title?: string
  avatar: string
}

export interface RolePermission {
  role: UserRole
  name: string
  description: string
  canCreateCase: boolean
  canEditCase: boolean
  canDeleteCase: boolean
  canMarkReadyForTest: boolean
  canExecuteTest: boolean
  canManageUsers: boolean
  canExportUat: boolean
  canViewAuditLogs: boolean
}

export interface ProjectMilestone {
  id: string
  title: string
  /** 'YYYY-MM-DD' */
  date: string
  type: MilestoneType
  description?: string
}

export interface Project {
  id: string
  /** short code, e.g. "AUTH", "SHOP" */
  key: string
  name: string
  description: string
  /** URL or base64 image */
  logo?: string
  createdAt: string
  updatedAt: string
  targetDeadline?: string
  status: ProjectStatus
  tags: string[]
  memberCount: number
  milestones?: ProjectMilestone[]
}

/** Project being created (no id) or edited */
export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export interface TestStep {
  id: string
  stepNumber: number
  action: string
  testData: string
  expectedResult: string
}

export interface TestCaseVersionRecord {
  version: string
  updatedBy: string
  timestamp: string
  changeSummary: string
  status: TestCaseStatus
  reason?: string
}

export interface ActiveUserPresence {
  id: string
  name: string
  avatar: string
  action: 'viewing' | 'editing'
}

export interface TestCase {
  /** e.g. "TC-101", sub-case "TC-101-1" */
  id: string
  numericId: number
  /** parent case id for sub-cases */
  parentId?: string | null
  projectId: string
  /** free-text requirement shown on the case (kept for imported / legacy cases) */
  requirement: string
  /** linked Requirement records (traceability) */
  requirementIds?: string[]
  testScenario: string
  name: string
  description: string
  prerequisite: string
  steps: TestStep[]
  expectedResults: string
  expectedImages: string[]
  actualResults: string
  actualImages: string[]
  status: TestCaseStatus
  priority: TestCasePriority
  /** due date 'YYYY-MM-DD' */
  expiryDate: string
  /** QA assigned */
  assignedTo?: string
  /** Dev assigned */
  assignedDev?: string
  /** e.g. "Spec Gap", "Race Condition" */
  rootCauseTag?: string
  /** number of Failed <-> Ready for Test cycles */
  churnCount?: number
  executedBy?: string
  executedAt?: string
  /** e.g. "v1.0", "v1.1" */
  version: string
  versionHistory?: TestCaseVersionRecord[]
  activeUser?: ActiveUserPresence | null
  createdAt: string
  updatedAt: string
}

/** A parent case with its sub-cases */
export type TestCaseNode = TestCase & { subCases: TestCase[] }

/** New order of a project's cases: parents in order, each with its sub-case ids in order */
export interface TestCaseOrder {
  id: string
  subIds: string[]
}

/** Result of a reorder: the renumbered cases and every old id -> new id that changed */
export interface TestCaseReorderResult {
  cases: TestCase[]
  renames: Record<string, string>
}

/** Data sent by the test case form */
export type TestCaseInput = Omit<TestCase, 'createdAt' | 'updatedAt'> & {
  changeSummary?: string
  bumpMajor?: boolean
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'EXPORT' | 'ADD_SUBCASE' | 'EXTEND_DUE_DATE' | 'SLA_BREACHED'

export interface AuditChange {
  field: string
  oldValue?: unknown
  newValue?: unknown
}

export interface AuditTrailEntry {
  id: string
  timestamp: string
  userId: string
  userName: string
  userRole: string
  action: AuditAction
  targetType: 'PROJECT' | 'TEST_CASE'
  targetId: string
  /** project of a TEST_CASE target: case ids restart per project (TC-101 …) */
  projectId?: string
  targetTitle: string
  details: string
  changes?: AuditChange[]
}

export type NotificationType = 'MODIFIED' | 'EXPIRING' | 'STATUS_CHANGED' | 'SYSTEM'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  read: boolean
  projectId?: string
  testCaseId?: string
  severity: 'info' | 'warning' | 'error' | 'success'
}

export interface ProjectStats {
  total: number
  passed: number
  failed: number
  blocked: number
  inProgress: number
  untested: number
  passRate: number
  /** count for every status, including pending / ready_for_test */
  byStatus: Record<TestCaseStatus, number>
}


// =============================================================================
// Authoring helpers (templates, import, AI drafts)
// =============================================================================

/** A step without id / number (templates, drafts, import rows) */
export type StepDraft = Pick<TestStep, 'action' | 'testData' | 'expectedResult'>

/** A test case before it gets an id: produced by templates, the import wizard and AI drafts */
export interface TestCaseDraft {
  name: string
  requirement: string
  testScenario: string
  prerequisite: string
  description?: string
  priority: TestCasePriority
  steps: StepDraft[]
  expectedResults: string
  /** positive / negative / boundary (AI drafts) */
  kind?: 'positive' | 'negative' | 'boundary'
  /** linked requirement ids */
  requirementIds?: string[]
}

export interface TestCaseTemplate {
  id: string
  name: string
  category: string
  description: string
  draft: Omit<TestCaseDraft, 'requirement' | 'requirementIds'>
  /** shipped with the system (can't be deleted) */
  builtIn?: boolean
  createdBy?: string
  usageCount: number
}

// =============================================================================
// Requirements & traceability
// =============================================================================

export type RequirementType = 'functional' | 'non_functional' | 'business_rule'
export type RequirementStatus = 'draft' | 'approved' | 'changed' | 'deprecated'
/** derived from the linked cases */
export type CoverageStatus = 'not_covered' | 'not_run' | 'in_progress' | 'failed' | 'passed'

export interface Requirement {
  id: string
  projectId: string
  /** e.g. "REQ-PAY-01" */
  code: string
  title: string
  description: string
  type: RequirementType
  priority: TestCasePriority
  status: RequirementStatus
  /** where it came from: PRD section, Jira epic, meeting ... */
  source?: string
  acceptanceCriteria: string[]
  createdAt: string
  updatedAt: string
}

export type RequirementInput = Omit<Requirement, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

// =============================================================================
// Test runs (rounds of execution) & defects
// =============================================================================

export type RunType = 'smoke' | 'functional' | 'regression' | 'uat'
export type RunStatus = 'planned' | 'in_progress' | 'completed'
export type ResultStatus = 'untested' | 'passed' | 'failed' | 'blocked' | 'skipped'

export interface StepResult {
  stepId: string
  status: ResultStatus
  actual: string
  evidence: string[]
}

/** One case inside a run. A snapshot of the case is kept so later edits don't rewrite history. */
export interface RunResult {
  caseId: string
  caseName: string
  caseVersion: string
  priority: TestCasePriority
  steps: TestStep[]
  assignee?: string
  status: ResultStatus
  stepResults: StepResult[]
  actualResults: string
  evidence: string[]
  defectIds: string[]
  notes: string
  executedBy?: string
  executedAt?: string
}

export interface TestRun {
  id: string
  projectId: string
  name: string
  type: RunType
  /** 1, 2, 3 … re-test rounds */
  round: number
  environment: string
  build: string
  status: RunStatus
  plannedStart: string
  plannedEnd: string
  startedAt?: string
  completedAt?: string
  createdBy: string
  createdAt: string
  results: RunResult[]
}

export type TestRunInput = Pick<TestRun, 'projectId' | 'name' | 'type' | 'round' | 'environment' | 'build' | 'plannedStart' | 'plannedEnd'> & {
  caseIds: string[]
  assignee?: string
}

export type DefectSeverity = 'critical' | 'major' | 'minor' | 'trivial'
export type DefectStatus = 'open' | 'in_progress' | 'fixed' | 'retest' | 'closed' | 'rejected'

export interface DefectComment {
  by: string
  at: string
  text: string
}

export interface Defect {
  /** e.g. "BUG-007" */
  id: string
  projectId: string
  title: string
  description: string
  stepsToReproduce: string
  expected: string
  actual: string
  severity: DefectSeverity
  status: DefectStatus
  caseId?: string
  runId?: string
  stepNumber?: number
  assignee?: string
  reportedBy: string
  /** Jira / GitHub issue key */
  externalKey?: string
  environment?: string
  evidence: string[]
  comments: DefectComment[]
  createdAt: string
  updatedAt: string
}

export type DefectInput = Omit<Defect, 'id' | 'createdAt' | 'updatedAt' | 'comments' | 'reportedBy'> & { id?: string }

// =============================================================================
// Documents (generated from system data, frozen as a snapshot)
// =============================================================================

export type DocumentType = 'test_spec' | 'test_summary' | 'uat' | 'rtm'
export type DocumentStatus = 'draft' | 'pending_signoff' | 'signed' | 'rejected'
export type UatDecision = 'accepted' | 'conditional' | 'rejected'

export interface Signatory {
  /** "ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ" … */
  role: string
  name: string
  position: string
  status: 'pending' | 'signed' | 'rejected'
  signedAt?: string
  comment?: string
}

export interface DocumentOptions {
  /** cases from one run, or all cases of the project */
  runId?: string
  includeSubCases: boolean
  includeSteps: boolean
  includeEvidence: boolean
  includeDefects: boolean
  includeTraceability: boolean
}

export interface UatDetails {
  testPeriod: string
  environment: string
  decision: UatDecision
  remarks: string
  /** risks acknowledged at generation (Release at Risk gatekeeper) */
  riskAcknowledged: boolean
}

/** One case as printed in a document */
export interface DocCase {
  id: string
  name: string
  parentId?: string | null
  requirement: string
  testScenario: string
  prerequisite: string
  priority: TestCasePriority
  steps: TestStep[]
  expectedResults: string
  /** result in the chosen run, else the case's current status */
  outcome: 'passed' | 'failed' | 'blocked' | 'not_run'
  /** display label of the result */
  result: string
  resultTone: Tone
  actualResults: string
  executedBy?: string
  executedAt?: string
  stepResults?: StepResult[]
  evidence: string[]
  defectIds: string[]
}

export interface DocumentSnapshot {
  generatedAt: string
  project: Pick<Project, 'name' | 'key' | 'description' | 'targetDeadline'>
  run?: Pick<TestRun, 'name' | 'round' | 'type' | 'environment' | 'build' | 'plannedStart' | 'plannedEnd' | 'startedAt' | 'completedAt'>
  summary: { total: number; passed: number; failed: number; blocked: number; notRun: number; passRate: number }
  cases: DocCase[]
  defects: Pick<Defect, 'id' | 'title' | 'severity' | 'status' | 'caseId' | 'assignee' | 'externalKey'>[]
  requirements: { code: string; title: string; caseIds: string[]; coverage: CoverageStatus }[]
  /** Failed / Blocked / Overdue / open defects at generation time */
  risks: string[]
}

export interface DocumentRecord {
  id: string
  projectId: string
  type: DocumentType
  title: string
  docNumber: string
  version: number
  status: DocumentStatus
  options: DocumentOptions
  uat?: UatDetails
  signatories: Signatory[]
  snapshot: DocumentSnapshot
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DocumentRequest = Pick<DocumentRecord, 'projectId' | 'type' | 'title' | 'docNumber' | 'options' | 'uat' | 'signatories'>

/** Organisation branding and defaults for every generated document */
export interface DocumentTemplate {
  companyName: string
  companyAddress: string
  logo: string
  /** e.g. "{TYPE}-{KEY}-{YYYYMMDD}-{NN}" */
  docNumberPattern: string
  headerNote: string
  footerNote: string
  defaultSignatories: Pick<Signatory, 'role' | 'position'>[]
}
