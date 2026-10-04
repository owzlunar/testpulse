import { logger } from '#core/config/logger.js'
import type { Migration } from '#core/database/migrations.js'
import { requirements } from '#modules/requirement/index.js'

// Requirements now say where they come from: a TOR clause or added on top of it. Those stored before
// that can't say, so they become additional ones without a clause (QA can mark the TOR ones later).
export const requirementOrigin: Migration = {
  id: '20261005-01-requirement-origin',
  description: 'requirements without an origin become additional ones',
  async up() {
    const changed = await requirements.backfillOrigin()
    if (changed) logger.info(`[migrate] ${changed} requirements marked as additional (not from the TOR)`)
  },
}
