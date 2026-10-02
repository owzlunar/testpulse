import { createReadStream } from 'node:fs'
import { mkdir, rm, writeFile, access } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import type { PutObject, StorageAdapter } from './storage.js'

export class LocalStorageAdapter implements StorageAdapter {
  readonly driver = 'local' as const
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  /** keys are server-made, but never let one point outside the root */
  private pathOf(key: string): string {
    const path = resolve(this.root, key)
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`)
    return path
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true })
  }

  async put({ key, body }: PutObject): Promise<void> {
    const path = this.pathOf(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }

  async get(key: string): Promise<Readable> {
    const path = this.pathOf(key)
    await access(path)
    return createReadStream(path)
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true })
  }
}
