import type { TestProject } from 'vitest/node'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// The database tests use: MONGODB_URI of backend/.env.test (vitest.config.ts), otherwise one in-memory
// replica set (transactions work) for the whole run, same major version as the local server.
declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
    /** true: every file uses that one database (as given), false: each file makes its own */
    sharedDatabase: boolean
  }
}

let replSet: MongoMemoryReplSet | undefined

export async function setup(project: TestProject) {
  const shared = process.env.TEST_MONGODB_URI
  if (shared) {
    const name = new URL(shared).pathname.slice(1)
    // the tests empty every collection: never let them near real data
    if (!/test/i.test(name)) throw new Error(`.env.test: MONGODB_URI must name a test database (got "${name}")`)
    project.provide('mongoUri', shared)
    project.provide('sharedDatabase', true)
    return
  }
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, binary: { version: '8.0.4' } })
  project.provide('mongoUri', replSet.getUri())
  project.provide('sharedDatabase', false)
}

export async function teardown() {
  await replSet?.stop()
}
