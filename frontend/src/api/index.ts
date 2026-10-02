// The API every store and component uses. Each module is backed by the real backend (src/api/real)
// or the mock server (src/api/mock); callers never know which. The choice is made at build time
// (vite.config.ts: VITE_API_MODE=mock|real, VITE_API_MOCK=<modules kept on the mock>) into
// constants like __API_MOCK_PROJECT__, so a build that is all real contains no mock code.
import { withMockCaseStats, withMockSession } from './bridge'
import type * as Contract from './contract'
import * as mock from './mock'
import * as real from './real'

/** true while any module runs on the mock (bridges in bridge.ts keep it consistent with the real ones) */
const anyMock = __API_ANY_MOCK__

export type * from './contract'
export { ApiError, errorMessage } from './errors'

export const authApi: Contract.AuthApi = __API_MOCK_AUTH__ ? mock.authApi : anyMock ? withMockSession(real.authApi) : real.authApi
export const userApi: Contract.UserApi = __API_MOCK_USER__ ? mock.userApi : real.userApi
export const roleApi: Contract.RoleApi = __API_MOCK_ROLE__ ? mock.roleApi : real.roleApi
export const teamApi: Contract.TeamApi = __API_MOCK_TEAM__ ? mock.teamApi : real.teamApi
export const projectApi: Contract.ProjectApi = __API_MOCK_PROJECT__
  ? mock.projectApi
  : __API_MOCK_TEST_CASE__
    ? withMockCaseStats(real.projectApi)
    : real.projectApi
export const settingsApi: Contract.SettingsApi = __API_MOCK_SETTINGS__ ? mock.settingsApi : real.settingsApi
export const auditApi: Contract.AuditApi = __API_MOCK_AUDIT__ ? mock.auditApi : real.auditApi
export const testCaseApi: Contract.TestCaseApi = mock.testCaseApi
export const requirementApi: Contract.RequirementApi = mock.requirementApi
export const runApi: Contract.RunApi = mock.runApi
export const defectApi: Contract.DefectApi = mock.defectApi
export const documentApi: Contract.DocumentApi = mock.documentApi
export const notificationApi: Contract.NotificationApi = mock.notificationApi
export const templateApi: Contract.TemplateApi = mock.templateApi
export const aiApi: Contract.AiApi = mock.aiApi
export const fileApi: Contract.FileApi = __API_MOCK_FILE__ ? mock.fileApi : real.fileApi

// test cases, requirements, runs, defects, documents, notifications, templates and AI have no real
// implementation yet: always the mock

/** the demo login shortcut (switching user without a password) exists only with the mock sign-in */
export const canSwitchUser = __API_MOCK_AUTH__

/** mock data only: wipes the demo data so the next load re-seeds it (null with the real backend) */
export const demoData: { reset(): void } | null = anyMock ? { reset: mock.resetDemoData } : null
