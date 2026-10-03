import type { AppModule } from '#core/module.js'
import { auditLogModule } from '#modules/audit-log/index.js'
import { authModule } from '#modules/auth/index.js'
import { defectModule } from '#modules/defect/index.js'
import { fileModule } from '#modules/file/index.js'
import { notificationModule } from '#modules/notification/index.js'
import { projectModule } from '#modules/project/index.js'
import { requirementModule } from '#modules/requirement/index.js'
import { roleModule } from '#modules/role/index.js'
import { runModule } from '#modules/run/index.js'
import { settingsModule } from '#modules/settings/index.js'
import { teamModule } from '#modules/team/index.js'
import { templateModule } from '#modules/template/index.js'
import { testCaseModule } from '#modules/test-case/index.js'
import { userModule } from '#modules/user/index.js'

// The modules this API runs, in start-up order (a module's setup may rely on the ones before it).
// Removing a module = deleting its line here and its folder.
export const appModules: AppModule[] = [
  auditLogModule,
  roleModule,
  userModule,
  authModule,
  teamModule,
  projectModule,
  settingsModule,
  notificationModule,
  fileModule,
  requirementModule,
  testCaseModule,
  templateModule,
  runModule,
  defectModule,
]
