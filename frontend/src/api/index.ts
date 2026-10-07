// The API every store and component uses. Each module is backed by the backend (src/api/rest) or the
// mock server (src/api/mock); callers never know which. The choice is made at build time
// (vite.config.ts: VITE_API_MODE=rest|mock, VITE_API_REST=<modules on>) into constants like
// __API_MOCK_PROJECT__, so a build that is all rest contains no mock code.
import type * as Contract from './contract'
import * as mock from './mock'
import * as rest from './rest'

/** true while any module runs on the mock (the demo-data reset is offered then) */
const anyMock = __API_ANY_MOCK__

export type * from './contract'
export { ApiError, errorMessage } from './errors'

export const authApi: Contract.AuthApi = __API_MOCK_AUTH__ ? mock.authApi : rest.authApi
export const userApi: Contract.UserApi = __API_MOCK_USER__ ? mock.userApi : rest.userApi
export const roleApi: Contract.RoleApi = __API_MOCK_ROLE__ ? mock.roleApi : rest.roleApi
export const teamApi: Contract.TeamApi = __API_MOCK_TEAM__ ? mock.teamApi : rest.teamApi
export const projectApi: Contract.ProjectApi = __API_MOCK_PROJECT__ ? mock.projectApi : rest.projectApi
export const settingsApi: Contract.SettingsApi = __API_MOCK_SETTINGS__ ? mock.settingsApi : rest.settingsApi
export const auditApi: Contract.AuditApi = __API_MOCK_AUDIT__ ? mock.auditApi : rest.auditApi
export const fileApi: Contract.FileApi = __API_MOCK_FILE__ ? mock.fileApi : rest.fileApi
export const notificationApi: Contract.NotificationApi = __API_MOCK_NOTIFICATION__ ? mock.notificationApi : rest.notificationApi
export const testCaseApi: Contract.TestCaseApi = __API_MOCK_TEST_CASE__ ? mock.testCaseApi : rest.testCaseApi
export const requirementApi: Contract.RequirementApi = __API_MOCK_REQUIREMENT__ ? mock.requirementApi : rest.requirementApi
export const templateApi: Contract.TemplateApi = __API_MOCK_TEMPLATE__ ? mock.templateApi : rest.templateApi
export const runApi: Contract.RunApi = __API_MOCK_RUN__ ? mock.runApi : rest.runApi
export const defectApi: Contract.DefectApi = __API_MOCK_DEFECT__ ? mock.defectApi : rest.defectApi
export const documentApi: Contract.DocumentApi = __API_MOCK_DOCUMENT__ ? mock.documentApi : rest.documentApi
export const reportApi: Contract.ReportApi = __API_MOCK_REPORT__ ? mock.reportApi : rest.reportApi
export const aiApi: Contract.AiApi = __API_MOCK_AI__ ? mock.aiApi : rest.aiApi
export const backupApi: Contract.BackupApi = __API_MOCK_BACKUP__ ? mock.backupApi : rest.backupApi

export type ApiModule =
  | 'ai'
  | 'audit'
  | 'auth'
  | 'backup'
  | 'defect'
  | 'document'
  | 'file'
  | 'notification'
  | 'project'
  | 'report'
  | 'requirement'
  | 'role'
  | 'run'
  | 'settings'
  | 'team'
  | 'template'
  | 'test-case'
  | 'user'

/**
 * Modules that are on: their pages, menus and widgets show. All of them with the mock; in rest mode
 * only the ones VITE_API_REST lists (the others wait for the backend).
 */
export const apiOn: Readonly<Record<ApiModule, boolean>> = {
  ai: __API_ON_AI__,
  audit: __API_ON_AUDIT__,
  auth: __API_ON_AUTH__,
  backup: __API_ON_BACKUP__,
  defect: __API_ON_DEFECT__,
  document: __API_ON_DOCUMENT__,
  file: __API_ON_FILE__,
  notification: __API_ON_NOTIFICATION__,
  project: __API_ON_PROJECT__,
  report: __API_ON_REPORT__,
  requirement: __API_ON_REQUIREMENT__,
  role: __API_ON_ROLE__,
  run: __API_ON_RUN__,
  settings: __API_ON_SETTINGS__,
  team: __API_ON_TEAM__,
  template: __API_ON_TEMPLATE__,
  'test-case': __API_ON_TEST_CASE__,
  user: __API_ON_USER__,
}

/** every module the page or widget needs is on */
export const apiAllOn = (modules: readonly ApiModule[] = []) => modules.every((m) => apiOn[m])

/**
 * The mock stores any notification the web app sends; the backend creates its own with each change
 * (only a confirmation to oneself is posted), so the stores send the others only to the mock.
 */
export const clientSendsNotifications = __API_MOCK_NOTIFICATION__

/** the demo login shortcut (switching user without a password) exists only with the mock sign-in */
export const canSwitchUser = __API_MOCK_AUTH__

/** mock data only: wipes the demo data so the next load re-seeds it (null with the backend) */
export const demoData: { reset(): void } | null = anyMock ? { reset: mock.resetDemoData } : null
