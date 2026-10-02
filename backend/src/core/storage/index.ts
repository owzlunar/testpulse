import { config } from '../config/env.js'
import { LocalStorageAdapter } from './local.adapter.js'
import { MinioStorageAdapter } from './minio.adapter.js'
import type { StorageAdapter } from './storage.js'

export type { StorageAdapter, PutObject } from './storage.js'

let adapter: StorageAdapter | null = null

export function storage(): StorageAdapter {
  adapter ??= config.storage.driver === 'minio' ? new MinioStorageAdapter(config.minio) : new LocalStorageAdapter(config.storage.localRoot)
  return adapter
}

/** tests: use another adapter (e.g. a temp directory) */
export const setStorage = (next: StorageAdapter | null) => {
  adapter = next
}
