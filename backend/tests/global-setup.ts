import type { TestProject } from 'vitest/node'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// One MongoDB replica set (transactions work) for the whole run; same major version as production.
declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}

let replSet: MongoMemoryReplSet | undefined

export async function setup(project: TestProject) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, binary: { version: '6.0.14' } })
  project.provide('mongoUri', replSet.getUri())
}

export async function teardown() {
  await replSet?.stop()
}
