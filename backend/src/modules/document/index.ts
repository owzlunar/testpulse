import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { DocumentModel, DocumentTemplateModel } from './document.model.js'
import { documentRepository } from './document.repository.js'
import { documentRouter } from './document.routes.js'

// Documents made from a project's data (test spec, summary report, UAT sign-off, traceability matrix),
// frozen when generated, signed off line by line; plus the organisation's document template. A
// document keeps the case ids it printed: it is a record of that moment, not a live view.
export const documentModule: AppModule = {
  name: 'document',
  router: documentRouter,
  models: [DocumentModel, DocumentTemplateModel],
  setup() {
    on('project.deleted', ({ projectId }) => documentRepository.deleteOfProject(projectId))
  },
}
