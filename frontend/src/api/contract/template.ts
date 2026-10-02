import type { TestCaseTemplate } from '@/types'

export interface TemplateApi {
  /** GET /test-case-templates */
  fetchTemplates(): Promise<TestCaseTemplate[]>

  /** POST /test-case-templates */
  createTemplate(input: Omit<TestCaseTemplate, 'id' | 'usageCount' | 'builtIn'>): Promise<TestCaseTemplate>

  /** POST /test-case-templates/:id/use (usage statistics) */
  markTemplateUsed(id: string): Promise<void>

  /** DELETE /test-case-templates/:id */
  deleteTemplate(id: string): Promise<void>
}
