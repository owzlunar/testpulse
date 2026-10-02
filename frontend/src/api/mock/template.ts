import type { TestCaseTemplate } from '@/types'
import { ApiError } from '@/api/errors'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { assertCan } from './project'
import { SEED_TEMPLATES } from './seeds/templates.seed'
import { STORAGE_KEYS, load, save } from './storage'

// --- API ------------------------------------------------------------------------
const templates = () => load(STORAGE_KEYS.templates, SEED_TEMPLATES)

/** GET /test-case-templates */
export const fetchTemplates = () => respond(templates)

/** POST /test-case-templates */
export const createTemplate = (input: Omit<TestCaseTemplate, 'id' | 'usageCount' | 'builtIn'>) =>
  respond(() => {
    assertCan('case.edit')
    const tpl: TestCaseTemplate = { ...input, id: newId('tpl'), usageCount: 0 }
    save(STORAGE_KEYS.templates, [tpl, ...templates()])
    return tpl
  })

/** POST /test-case-templates/:id/use (usage statistics) */
export const markTemplateUsed = (id: string) =>
  respond(() => {
    assertCan('case.edit')
    const list = templates()
    const tpl = list.find((t) => t.id === id)
    if (tpl) tpl.usageCount++
    save(STORAGE_KEYS.templates, list)
  }, 50)

/** DELETE /test-case-templates/:id */
export const deleteTemplate = (id: string) =>
  respond(() => {
    assertCan('case.edit')
    const list = templates()
    if (list.find((t) => t.id === id)?.builtIn) throw new ApiError('ลบ Template มาตรฐานของระบบไม่ได้', 403)
    save(
      STORAGE_KEYS.templates,
      list.filter((t) => t.id !== id),
    )
  })
