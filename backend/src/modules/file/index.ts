import type { AppModule } from '#core/module.js'
import { FileModel } from './file.model.js'
import { fileRouter } from './file.routes.js'

// Uploaded images (avatars, project logos), stored through the storage adapter (local disk / MinIO).
export const fileModule: AppModule = {
  name: 'file',
  router: fileRouter,
  models: [FileModel],
}
