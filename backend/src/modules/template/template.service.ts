import type { TestCaseTemplate } from '#contract/types.js'
import type { Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { templateRepository } from './template.repository.js'
import { SEED_TEMPLATES } from './template.seed-data.js'

export type TemplateFields = Pick<TestCaseTemplate, 'name' | 'category' | 'description' | 'draft'>

// Templates are shared by every project (common test patterns); built-in ones can't be deleted.
export const templateService = {
  /** GET /test-case-templates */
  list: (): Promise<TestCaseTemplate[]> => templateRepository.find(),

  /** POST /test-case-templates */
  create: (p: Principal, fields: TemplateFields): Promise<TestCaseTemplate> =>
    templateRepository.create({ ...fields, createdBy: p.name, usageCount: 0 }),

  /** POST /test-case-templates/:id/use (usage statistics) */
  markUsed: (id: string) => templateRepository.countUse(id),

  /** the templates shipped with the system, added when missing (usage counts of existing ones stay) */
  async ensureBuiltIns(): Promise<number> {
    let added = 0
    for (const { id, usageCount: _usage, ...template } of SEED_TEMPLATES.filter((t) => t.builtIn)) {
      if (await templateRepository.ensure(id, { ...template, usageCount: 0 })) added++
    }
    return added
  },

  /** DELETE /test-case-templates/:id */
  async remove(id: string): Promise<void> {
    const template = await templateRepository.findById(id)
    if (!template) throw ApiError.notFound('ไม่พบ Template')
    if (template.builtIn) throw ApiError.forbidden('ลบ Template มาตรฐานของระบบไม่ได้')
    await templateRepository.remove(id)
  },
}
