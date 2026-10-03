import type { AppModule } from '#core/module.js'
import { reportRouter } from './report.routes.js'

// Reports: a project's aggregates (cases, runs, defects) computed on the server with the shared rule,
// and the audit entry for files the browser exports. No data of its own.
export const reportModule: AppModule = {
  name: 'report',
  router: reportRouter,
  models: [],
}
