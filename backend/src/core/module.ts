import type { Router } from 'express'
import type { Model } from 'mongoose'
import type { ScheduledJob } from './jobs/scheduler.js'

// What every feature module exports from its index.ts. Core loads modules through this shape only,
// so deleting a module folder (and its line in src/index.ts) leaves the rest of the app working.

export interface Seed {
  name: string
  run(): Promise<void>
}

export interface AppModule {
  name: string
  /** mounted at BASE_PATH; routes spell out their full paths (e.g. '/projects/:id'), as in the API contract */
  router?: Router
  /** models whose indexes `npm run db:indexes` builds (any document type) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  models?: Model<any>[]
  jobs?: ScheduledJob[]
  seeds?: Seed[]
  /** start-up wiring: register resolvers / sinks, subscribe to events (runs before routes are served) */
  setup?(): void | Promise<void>
}
