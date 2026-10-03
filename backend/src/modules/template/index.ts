import type { AppModule } from '#core/module.js'
import { TemplateModel } from './template.model.js'
import { templateRouter } from './template.routes.js'
import { templateSeed } from './template.seed.js'
import { templateService } from './template.service.js'

// Test case templates: common test patterns shared by every project. Public API: adding the built-in
// ones (a migration does it on every database).
export const templates = {
  ensureBuiltIns: templateService.ensureBuiltIns,
}

export const templateModule: AppModule = {
  name: 'template',
  router: templateRouter,
  models: [TemplateModel],
  seeds: [templateSeed],
}
