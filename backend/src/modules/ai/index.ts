import type { AppModule } from '#core/module.js'
import { aiRouter } from './ai.routes.js'

// AI test case drafts from a language model (AI_PROVIDER: none, or a local Ollama). Drafts are
// suggestions QA reviews in the app; nothing is saved here. No data of its own.
export const aiModule: AppModule = {
  name: 'ai',
  router: aiRouter,
  models: [],
}
