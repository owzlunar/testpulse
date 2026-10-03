import type { TemplateApi } from '@/api/contract'
import type { TestCaseTemplate } from '@/types'
import { del, get, post } from './http'

export const templateApi: TemplateApi = {
  fetchTemplates: () => get<TestCaseTemplate[]>('/test-case-templates'),
  createTemplate: (input) => post<TestCaseTemplate>('/test-case-templates', input),
  markTemplateUsed: (id) => post<void>(`/test-case-templates/${encodeURIComponent(id)}/use`),
  deleteTemplate: (id) => del<void>(`/test-case-templates/${encodeURIComponent(id)}`),
}
