// The API every store and component uses. Each module is backed by the real backend (src/api/real)
// or the mock server (src/api/mock); callers never know which.
import type * as Contract from './contract'
import * as mock from './mock'

export type * from './contract'
export { ApiError, errorMessage } from './errors'

export const authApi: Contract.AuthApi = mock.authApi
export const userApi: Contract.UserApi = mock.userApi
export const roleApi: Contract.RoleApi = mock.roleApi
export const teamApi: Contract.TeamApi = mock.teamApi
export const projectApi: Contract.ProjectApi = mock.projectApi
export const settingsApi: Contract.SettingsApi = mock.settingsApi
export const auditApi: Contract.AuditApi = mock.auditApi
export const testCaseApi: Contract.TestCaseApi = mock.testCaseApi
export const requirementApi: Contract.RequirementApi = mock.requirementApi
export const runApi: Contract.RunApi = mock.runApi
export const defectApi: Contract.DefectApi = mock.defectApi
export const documentApi: Contract.DocumentApi = mock.documentApi
export const notificationApi: Contract.NotificationApi = mock.notificationApi
export const templateApi: Contract.TemplateApi = mock.templateApi
export const aiApi: Contract.AiApi = mock.aiApi

/** mock data only: wipes the demo data so the next load re-seeds it (null with the real backend) */
export const demoData: { reset(): void } | null = { reset: mock.resetDemoData }
