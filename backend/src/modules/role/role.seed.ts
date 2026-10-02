import type { PermissionKey } from '#contract/types.js'
import type { Seed } from '#core/module.js'
import { RoleModel } from './role.model.js'
import { roleService } from './role.service.js'

// Demo roles (same ids as the web app's mock data). Upserted by id: re-running resets them.
const VIEW_ALL: PermissionKey[] = [
  'requirement.view',
  'case.view',
  'run.view',
  'defect.view',
  'calendar.view',
  'document.view',
  'report.view',
  'notification.receive',
]

const DEMO_ROLES = [
  {
    _id: 'role-qa-lead',
    name: 'QA Lead',
    description: 'หัวหน้าทีมทดสอบ วางแผนรอบทดสอบ ดูแล Requirement จัดลำดับเคส ปิด Defect และลงนามเอกสาร',
    discipline: 'qa',
    tone: 'success',
    icon: 'tabler:crown',
    permissions: [
      ...VIEW_ALL,
      'requirement.edit',
      'requirement.delete',
      'case.edit',
      'case.archive',
      'case.delete',
      'case.reorder',
      'case.restoreVersion',
      'run.create',
      'run.execute',
      'run.close',
      'defect.report',
      'defect.resolve',
      'document.create',
      'document.sign',
      'audit.view',
    ],
  },
  {
    _id: 'role-qa-tester',
    name: 'QA Tester',
    description: 'ผู้ทดสอบ เขียนและแก้ Test Case บันทึกผลการทดสอบ รายงาน Defect และออกเอกสาร UAT',
    discipline: 'qa',
    tone: 'info',
    icon: 'tabler:flask',
    permissions: [...VIEW_ALL, 'case.edit', 'case.archive', 'run.execute', 'defect.report', 'document.create'],
  },
  {
    _id: 'role-dev',
    name: 'Developer',
    description: 'นักพัฒนา ดูขั้นตอนทดสอบ ส่งมอบงานพร้อมเทส และอัปเดตความคืบหน้าของ Defect',
    discipline: 'dev',
    tone: 'warning',
    icon: 'tabler:code',
    permissions: [...VIEW_ALL, 'case.handoff', 'defect.report'],
  },
]

export const roleSeed: Seed = {
  name: 'roles',
  async run() {
    await roleService.ensureAdminRole()
    for (const { _id, ...role } of DEMO_ROLES) {
      await RoleModel.findOneAndUpdate({ _id }, { $set: { ...role, nameKey: role.name.toLowerCase() } }, { upsert: true })
    }
  },
}
