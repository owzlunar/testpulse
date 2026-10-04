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

/**
 * What a role may do, by module. The catalog (labels, groups) is PERMISSION_GROUPS in role.service.ts.
 * Managing users, roles, teams and projects is not a permission: only the built-in Admin role can.
 */
export type PermissionKey =
  | 'requirement.view'
  | 'requirement.edit'
  | 'requirement.delete'
  | 'case.view'
  | 'case.edit'
  | 'case.archive'
  | 'case.delete'
  | 'case.reorder'
  | 'case.restoreVersion'
  | 'case.handoff'
  | 'run.view'
  | 'run.create'
  | 'run.execute'
  | 'run.close'
  | 'defect.view'
  | 'defect.report'
  | 'defect.resolve'
  | 'calendar.view'
  | 'document.view'
  | 'document.create'
  | 'document.sign'
  | 'report.view'
  | 'notification.receive'
  | 'audit.view'

export type NavItem = { header: string } | { title: string; icon: string; to: string; badge?: string }

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
export type Rule = (value: unknown) => true | string

// =============================================================================
// Domain types (TestPulse)
// =============================================================================

export type TestCaseStatus = 'pending' | 'ready_for_test' | 'untested' | 'in_progress' | 'passed' | 'failed' | 'blocked'
export type TestCasePriority = 'low' | 'medium' | 'high' | 'critical'
/**
 * which side of the Dev <-> QA loop a role works on: fills the QA / Developer pickers and "my work";
 * ops = the team that runs the servers (customers' staging …): server problems go to them, not to Dev
 */
export type RoleDiscipline = 'qa' | 'dev' | 'ops' | 'other'
export type ProjectStatus = 'active' | 'in_review' | 'completed' | 'archived'
export type MilestoneType = 'code_freeze' | 'uat_signoff' | 'go_live'

export interface User {
  id: string
  name: string
  email: string
  /** null = new user without a role yet: sees only the dashboard and settings */
  roleId: string | null
  title?: string
  avatar: string
  /** invited = added by an Admin, has not set a password yet (can't sign in); missing = active */
  status?: UserStatus
}

export type UserStatus = 'active' | 'invited'

/** POST /auth/login, /auth/refresh, /auth/register, /auth/invites/:token/accept */
export interface AuthSession {
  user: User
  /** Bearer token for every other request; the refresh token travels in an httpOnly cookie */
  accessToken: string
  /** seconds until accessToken expires */
  expiresIn: number
}

/** POST /auth/register: a new account without a role */
export interface RegisterInput {
  name: string
  email: string
  title?: string
  password: string
}

/** POST /users (Admin): the person gets an email invite to set a password */
export type UserInviteInput = Pick<User, 'name' | 'email' | 'roleId'> & Partial<Pick<User, 'title' | 'avatar'>>

/** what an upload is for: decides who may upload it */
/** avatar / project-logo / document-logo: public pictures; case-image: test evidence (expected / actual results), behind a long random id */
export type FileCategory = 'avatar' | 'project-logo' | 'document-logo' | 'case-image'

/** GET /auth/invites/:token: who the invite is for (shown on the set-password page) */
export interface InviteInfo {
  name: string
  email: string
  expiresAt: string
}

/** POST /files: a stored upload; `url` goes into fields like Project.logo or User.avatar */
export interface UploadedFile {
  id: string
  url: string
  name: string
  contentType: string
  size: number
}

/** The signed-in user's preferences (GET / PUT /me/settings) */
export interface AppSettings {
  alertOnModification: boolean
  alertOnStatusChange: boolean
  alertOnExpiry: boolean
  /** warn this many days before a due date */
  expiryDaysThreshold: number
  obsidianFrontmatter: boolean
  obsidianCallouts: boolean
  obsidianWikilinks: boolean
  /** long pages keep a compact page header under the app bar while scrolling (md and up) */
  stickyPageHeader: boolean
}

/** A team of people (e.g. "ทีม Payment"); projects list the teams that may open them */
export interface Team {
  id: string
  name: string
  description: string
  tone: Tone
  memberIds: string[]
  createdAt: string
  updatedAt: string
}

export type TeamInput = Omit<Team, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

/** A role group created by an Admin, e.g. "QA Lead" can do more than "QA Tester" */
export interface Role {
  id: string
  name: string
  description: string
  discipline: RoleDiscipline
  tone: Tone
  icon: string
  permissions: PermissionKey[]
  /** 'admin' = the built-in Admin role: every permission, manages users / roles / teams / projects, can't be deleted */
  builtIn?: 'admin'
  createdAt: string
  updatedAt: string
}

export type RoleInput = Omit<Role, 'id' | 'createdAt' | 'updatedAt' | 'builtIn'> & { id?: string }

export interface ProjectMilestone {
  id: string
  title: string
  /** 'YYYY-MM-DD' */
  date: string
  type: MilestoneType
  description?: string
}

/** A server the project is tested on, e.g. TEST (the company's test server) or STAGING (the customer's) */
export interface ProjectEnvironment {
  /** made by the client like a milestone's id ("env-…"); never changes, so runs and defects keep pointing at it */
  id: string
  name: string
  /** its results are the cases' status (the Dev <-> QA loop); exactly one per project */
  primary: boolean
  /** the team that runs this server (e.g. the ops team): server problems found here go to its members */
  teamId?: string
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
  milestones?: ProjectMilestone[]
  /** teams that may open the project; empty = everyone with a role (Admins always can) */
  teamIds?: string[]
  /** where it is tested; the server keeps exactly one primary (a new project starts with TEST) */
  environments: ProjectEnvironment[]
  /** case counts of the active cases, worked out by the server for lists (cases load per project) */
  caseStats?: ProjectStats
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

/** What a version defines (the spec); images are not kept in history to save storage */
export type TestCaseSpec = Pick<
  TestCase,
  'name' | 'requirement' | 'requirementIds' | 'testScenario' | 'description' | 'prerequisite' | 'steps' | 'expectedResults'
>

export interface TestCaseVersionRecord {
  version: string
  updatedBy: string
  timestamp: string
  changeSummary: string
  status: TestCaseStatus
  reason?: string
  /** the spec as of this version (versions saved before snapshots existed have none) */
  snapshot?: TestCaseSpec
}

export interface ActiveUserPresence {
  id: string
  name: string
  avatar: string
  action: 'viewing' | 'editing'
}

export interface TestCase {
  /** e.g. "TC-101", sub-case "TC-101-1" (changes when the list is renumbered) */
  id: string
  /** stable internal identity: never changes, even when renumbering changes `id` */
  uid?: string
  /** revision: +1 on every write; a change carries the one it was based on (CaseExpectation) */
  rev?: number
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
  /** a linked requirement changed or was deleted after the case was written; cleared by a spec edit or "reviewed" */
  reviewNeeded?: TestCaseReviewFlag
  /** archived (soft-deleted): hidden from lists, stats, coverage and new runs; keeps its id and references */
  archivedAt?: string
  archivedBy?: string
  activeUser?: ActiveUserPresence | null
  createdAt: string
  updatedAt: string
}

export interface TestCaseReviewFlag {
  /** codes of the requirements that changed */
  requirementCodes: string[]
  /** latest change, e.g. "REQ-PAY-01 แก้ไข: ชื่อ, เกณฑ์การยอมรับ" */
  reason: string
  since: string
}

/** A case to move another one before / after in reorder mode */
export interface MoveTarget {
  id: string
  name: string
  /** list the target is in ('parents' or a parent id) and its index there */
  list: string
  index: number
  /** group title in the move menu (sub-cases: their parent) */
  group?: string
}

/** The copy of a case a change was based on; the server refuses (409 'stale') if the case moved on */
export interface CaseExpectation {
  uid: string
  rev: number
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

/** Who performs a mutation (the real backend takes it from the session) */
export interface Actor {
  id: string
  name: string
  avatar: string
}

/** A case update as applied by the server, with what changed (the client records audit / alerts from it) */
export interface TestCaseUpdateResult {
  testCase: TestCase
  before: TestCase
  statusChanged: boolean
  /** a new version was created (the spec changed, or a major bump was asked for) */
  newVersion: boolean
  /** the spec of a passed case changed: its status went back to ready_for_test */
  passInvalidated: boolean
}

/** Data sent by the test case form */
export type TestCaseInput = Omit<TestCase, 'createdAt' | 'updatedAt'> & {
  changeSummary?: string
  bumpMajor?: boolean
}

export type AuditAction =
  'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE' | 'RESTORE' | 'STATUS_CHANGE' | 'EXPORT' | 'ADD_SUBCASE' | 'EXTEND_DUE_DATE' | 'SLA_BREACHED'

export interface AuditChange {
  field: string
  oldValue?: unknown
  newValue?: unknown
}

/** what an audit entry is about (users, roles and teams are recorded by the backend) */
export type AuditTargetType = 'PROJECT' | 'TEST_CASE' | 'USER' | 'ROLE' | 'TEAM'

export interface AuditTrailEntry {
  id: string
  timestamp: string
  userId: string
  userName: string
  userRole: string
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  /** project of a TEST_CASE target: case ids restart per project (TC-101 …) */
  projectId?: string
  /** the target case was deleted; its id may be reused, so the entry no longer belongs to that id */
  targetDeleted?: boolean
  targetTitle: string
  details: string
  changes?: AuditChange[]
}

export type NotificationType = 'MODIFIED' | 'EXPIRING' | 'STATUS_CHANGED' | 'SYSTEM'

/** Who a notification is for. Without one it goes to everyone who can open its project. */
export interface NotificationAudience {
  /** these people (e.g. the developer assigned to the case) */
  userIds?: string[]
  /** everyone whose role works on this side (e.g. all QA when nobody is assigned) */
  disciplines?: RoleDiscipline[]
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  /** read by the signed-in user (the server works it out from readBy) */
  read: boolean
  projectId?: string
  testCaseId?: string
  severity: 'info' | 'warning' | 'error' | 'success'
  to?: NotificationAudience
  /** who caused it: not notified of their own action unless named in `to.userIds` */
  fromUserId?: string
  /** read / removed per person */
  readBy?: string[]
  hiddenFor?: string[]
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
  /** cases overdue or due within the warning window */
  attention: number
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

/** what to ask the AI for (AI drafts) */
export interface DraftOptions {
  positive: boolean
  negative: boolean
  boundary: boolean
  /** extra context, e.g. platform or business rules */
  context?: string
}

/** whether the server has a language model set up for drafts (the AI buttons show only then) */
export interface AiStatus {
  enabled: boolean
  /** the model drafts come from, e.g. "qwen2.5:14b" */
  model?: string
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
/** a clause of the contract's TOR, or a requirement added on top of it (meetings, change requests …) */
export type RequirementOrigin = 'tor' | 'additional'
/** derived from the linked cases */
export type CoverageStatus = 'not_covered' | 'not_run' | 'in_progress' | 'failed' | 'passed'

/** Saving / deleting a requirement: the cases the server flagged for review */
export interface RequirementChangeResult {
  requirement?: Requirement
  flaggedCases: TestCase[]
}

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
  origin: RequirementOrigin
  /** the TOR clause it comes from, e.g. "4.2.1" (TOR requirements only) */
  torClause?: string
  /** where it came from: PRD section, Jira epic, meeting ... */
  source?: string
  acceptanceCriteria: string[]
  createdAt: string
  updatedAt: string
}

export type RequirementInput = Omit<Requirement, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

/** One requirement read from an imported table (Excel / CSV): without a code it gets the next free one */
export type RequirementImportRow = Omit<RequirementInput, 'id' | 'projectId' | 'code'> & { code?: string }

/** What an import did: rows whose code already exists are skipped, or updated when asked */
export interface RequirementImportResult {
  created: Requirement[]
  updated: Requirement[]
  /** codes that already existed and were left as they are */
  skipped: string[]
  /** cases flagged for review because an updated requirement now says something else */
  flaggedCases: TestCase[]
}

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
  /** the case was deleted after this run: `caseId` is history only (the id may belong to a newer case) */
  caseDeleted?: boolean
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

/** What archiving or deleting a case (with its sub-cases) touches */
export interface TestCaseImpact {
  /** the case and its sub-cases */
  caseIds: string[]
  runs: { name: string; round: number; open: boolean }[]
  openDefects: { id: string; title: string }[]
  /** linked requirements; `uncovered` = no other active case covers it */
  requirements: { code: string; title: string; uncovered: boolean }[]
}

/** Saving a run result: the run, and the case update when the verdict became the case status */
export interface RunResultSaveResult {
  run: TestRun
  caseUpdate: TestCaseUpdateResult | null
}

export interface TestRun {
  id: string
  projectId: string
  name: string
  type: RunType
  /** 1, 2, 3 … re-test rounds */
  round: number
  /** the project environment it runs on; only runs on the primary one change the cases' status */
  environmentId: string
  /** that environment's name when the run was made (lists, search, documents) */
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

export type TestRunInput = Pick<TestRun, 'projectId' | 'name' | 'type' | 'round' | 'environmentId' | 'build' | 'plannedStart' | 'plannedEnd'> & {
  caseIds: string[]
  assignee?: string
}

export type DefectSeverity = 'critical' | 'major' | 'minor' | 'trivial'
export type DefectStatus = 'open' | 'in_progress' | 'fixed' | 'retest' | 'closed' | 'rejected'
/** code = the developers fix it; environment = the server (port, WAF, config …): the team running it fixes it */
export type DefectCause = 'code' | 'environment'

/** A case's latest result on one environment, from the runs on it (newest run wins, as on the primary) */
export interface EnvironmentResult {
  environmentId: string
  status: Exclude<ResultStatus, 'untested'>
  runId: string
  runName: string
  round: number
  caseVersion: string
  executedBy?: string
  executedAt?: string
}

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
  /** the linked case was deleted: `caseId` is history only (the id may belong to a newer case) */
  caseDeleted?: boolean
  runId?: string
  stepNumber?: number
  assignee?: string
  reportedBy: string
  /** Jira / GitHub issue key, or the customer's ticket (port / WAF request …) */
  externalKey?: string
  /** the project environment it was found on */
  environmentId?: string
  /** that environment's name (defects made before environments: free text) */
  environment?: string
  cause: DefectCause
  /** when it was first marked fixed (time to fix) */
  fixedAt?: string
  evidence: string[]
  comments: DefectComment[]
  createdAt: string
  updatedAt: string
}

export type DefectInput = Omit<Defect, 'id' | 'createdAt' | 'updatedAt' | 'comments' | 'reportedBy' | 'fixedAt'> & { id?: string }

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
  /** only TOR requirements, and only the cases linked to them (UAT, RTM) */
  torOnly?: boolean
}

export interface UatDetails {
  testPeriod: string
  /** the environment the customer accepts on (usually STAGING): results, pass rate and risks come from it */
  environmentId?: string
  /** its name (set by the server when an environment is chosen) */
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
  /** the environment the results come from (UAT on a chosen environment); none = the cases' status */
  environment?: Pick<ProjectEnvironment, 'name' | 'primary'>
  summary: { total: number; passed: number; failed: number; blocked: number; notRun: number; passRate: number }
  cases: DocCase[]
  defects: Pick<Defect, 'id' | 'title' | 'severity' | 'status' | 'caseId' | 'assignee' | 'externalKey' | 'cause' | 'environment'>[]
  requirements: { code: string; title: string; torClause?: string; caseIds: string[]; coverage: CoverageStatus }[]
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

// =============================================================================
// Universal search (one page of a group's matches; the rest by offset)
// =============================================================================

/** a test run as a search result (without its results) */
export type RunSearchHit = Pick<TestRun, 'id' | 'projectId' | 'name' | 'round' | 'type' | 'status' | 'environment' | 'build' | 'createdAt'>

/** a document as a search result (without its snapshot) */
export type DocumentSearchHit = Pick<DocumentRecord, 'id' | 'projectId' | 'type' | 'title' | 'docNumber' | 'version' | 'status' | 'updatedAt'>

// =============================================================================
// Reports (aggregates the server computes from a project's active cases, runs and defects)
// =============================================================================

export interface ProjectReport {
  projectId: string
  generatedAt: string
  stats: ProjectStats
  mainCases: number
  subCases: number
  /** test steps of every case */
  steps: number
  overdue: number
  /** bounced between Failed and Ready for Test more than once */
  highChurn: number
  byPriority: Record<TestCasePriority, number>
  /** most frequent first */
  rootCauses: { tag: string; count: number }[]
  runs: {
    total: number
    /** planned or in progress */
    open: number
    /** the newest run */
    latest?: Pick<TestRun, 'id' | 'name' | 'round' | 'status'> & { total: number; executed: number; passRate: number }
  }
  defects: {
    total: number
    open: number
    openBySeverity: Record<DefectSeverity, number>
    /** code vs server problems: how many, how many still open, average hours from report to fixed */
    byCause: Record<DefectCause, { total: number; open: number; avgFixHours: number | null }>
  }
  /** each environment's latest results over the active cases (the primary one is the cases' status) */
  environments: (Pick<ProjectEnvironment, 'id' | 'name' | 'primary'> & {
    passed: number
    failed: number
    blocked: number
    notRun: number
    passRate: number
  })[]
}

/** files made in the browser from a project's data (the server records that they were made) */
export type ExportFormat = 'markdown'
