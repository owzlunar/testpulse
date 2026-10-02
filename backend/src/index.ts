import { appModules } from './app-modules.js'
import { startServer } from '#core/server.js'

// Composition root: the API process.
await startServer(appModules)
