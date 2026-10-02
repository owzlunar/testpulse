// The mock API: each contract module backed by the mock server in this folder (LocalStorage).
import type * as Contract from '../contract'
import { draftTestCases } from './ai'
import { createAuditLog, fetchAuditLogs } from './audit'
import { addDefectComment, fetchDefects, saveDefect } from './defect'
import {
  deleteDocument,
  fetchDocumentTemplate,
  fetchDocuments,
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
} from './notification'
import { createProject, deleteProject, fetchProjects, updateProject } from './project'
import { deleteRequirement, fetchRequirements, saveRequirement } from './requirement'
import { deleteRole, fetchRoles, saveRole } from './role'
import { createRun, deleteRun, fetchRuns, saveResult, updateRun } from './run'
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
import { createUser, fetchSession, fetchUsers, login, updateUser } from './user'
export { resetDemoData } from './storage'

export const authApi = { fetchSession, login } satisfies Contract.AuthApi
export const userApi = { fetchUsers, createUser, updateUser } satisfies Contract.UserApi
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
export const requirementApi = { fetchRequirements, saveRequirement, deleteRequirement } satisfies Contract.RequirementApi
export const runApi = { fetchRuns, createRun, updateRun, saveResult, deleteRun } satisfies Contract.RunApi
export const defectApi = { fetchDefects, saveDefect, addDefectComment } satisfies Contract.DefectApi
export const documentApi = {
  fetchDocuments,
  generateDocument,
  regenerateDocument,
  updateDocument,
  signDocument,
  deleteDocument,
  fetchDocumentTemplate,
  saveDocumentTemplate,
} satisfies Contract.DocumentApi
export const notificationApi = {
  fetchNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
} satisfies Contract.NotificationApi
export const templateApi = { fetchTemplates, createTemplate, markTemplateUsed, deleteTemplate } satisfies Contract.TemplateApi
export const aiApi = { draftTestCases } satisfies Contract.AiApi
