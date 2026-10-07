import type { AppModule } from '#core/module.js'
import { backupRouter } from './backup.routes.js'

// Backup & recovery (PRD 5.15): the Admin page's way to the backup agent (src/agent), and the agent's
// alerts turned into in-app notifications and emails. No data of its own: the agent keeps its state.
export const backupModule: AppModule = {
  name: 'backup',
  router: backupRouter,
  models: [],
}
