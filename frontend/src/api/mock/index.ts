// The mock API: each contract module backed by the mock server in this folder (LocalStorage).
import type * as Contract from '../contract'
import { draftTestCases, fetchAiStatus } from './ai'
import { createAuditLog, fetchAuditLogs } from './audit'
import { addDefectComment, fetchDefects, saveDefect, searchDefects } from './defect'
import {
  deleteDocument,
  fetchDocumentTemplate,
  fetchDocuments,
  searchDocuments,
  generateDocument,
  regenerateDocument,
  saveDocumentTemplate,
  signDocument,
  updateDocument,
} from './document'
import {
  clearNotifications,
  createNotification,
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  watchNotifications,
} from './notification'
import { createProject, deleteProject, fetchProjects, updateProject } from './project'
import { fetchProjectReport, recordExport } from './report'
import { deleteRequirement, fetchRequirements, importRequirements, saveRequirement, searchRequirements } from './requirement'
import { deleteRole, fetchRoles, saveRole } from './role'
import { createRun, deleteRun, fetchRuns, saveResult, searchRuns, updateRun } from './run'
import { fetchSettings, saveSettings } from './settings'
import { deleteTeam, fetchTeams, saveTeam } from './team'
import { createTemplate, deleteTemplate, fetchTemplates, markTemplateUsed } from './template'
import {
  archiveTestCase,
  caseImpact,
  createTestCases,
  deleteTestCase,
  extendDueDate,
  fetchTestCases,
  markReviewed,
  reorderTestCases,
  restoreTestCase,
  restoreVersion,
  searchTestCases,
  updateTestCase,
} from './test-case'
import {
  acceptInvite,
  changePassword,
  fetchInvite,
  fetchSession,
  fetchUsers,
  inviteUser,
  login,
  logout,
  register,
  resendInvite,
  updateUser,
} from './user'
import { upload } from './file'
export { resetDemoData } from './storage'

export const authApi = { fetchSession, login, logout, register, fetchInvite, acceptInvite, changePassword } satisfies Contract.AuthApi
export const userApi = { fetchUsers, inviteUser, updateUser, resendInvite } satisfies Contract.UserApi
export const fileApi = { upload } satisfies Contract.FileApi
export const roleApi = { fetchRoles, saveRole, deleteRole } satisfies Contract.RoleApi
export const teamApi = { fetchTeams, saveTeam, deleteTeam } satisfies Contract.TeamApi
export const projectApi = { fetchProjects, createProject, updateProject, deleteProject } satisfies Contract.ProjectApi
export const settingsApi = { fetchSettings, saveSettings } satisfies Contract.SettingsApi
export const auditApi = { fetchAuditLogs, createAuditLog } satisfies Contract.AuditApi
export const testCaseApi = {
  fetchTestCases,
  searchTestCases,
  createTestCases,
  updateTestCase,
  restoreVersion,
  markReviewed,
  extendDueDate,
  archiveTestCase,
  restoreTestCase,
  caseImpact,
  deleteTestCase,
  reorderTestCases,
} satisfies Contract.TestCaseApi
export const requirementApi = {
  fetchRequirements,
  saveRequirement,
  importRequirements,
  deleteRequirement,
  searchRequirements,
} satisfies Contract.RequirementApi
export const runApi = { fetchRuns, searchRuns, createRun, updateRun, saveResult, deleteRun } satisfies Contract.RunApi
export const defectApi = { fetchDefects, searchDefects, saveDefect, addDefectComment } satisfies Contract.DefectApi
export const documentApi = {
  fetchDocuments,
  searchDocuments,
  generateDocument,
  regenerateDocument,
  updateDocument,
  signDocument,
  deleteDocument,
  fetchDocumentTemplate,
  saveDocumentTemplate,
} satisfies Contract.DocumentApi
export const reportApi = { fetchProjectReport, recordExport } satisfies Contract.ReportApi
export const notificationApi = {
  fetchNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
  watchNotifications,
} satisfies Contract.NotificationApi
export const templateApi = { fetchTemplates, createTemplate, markTemplateUsed, deleteTemplate } satisfies Contract.TemplateApi
export const aiApi = { fetchAiStatus, draftTestCases } satisfies Contract.AiApi
