import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalStorageAdapter } from '../local.adapter.js'

let dir: string
let storage: LocalStorageAdapter
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tp-storage-'))
  storage = new LocalStorageAdapter(dir)
  await storage.init()
})
afterAll(() => rm(dir, { recursive: true, force: true }))

const read = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString()
}

describe('local storage', () => {
  it('puts, gets and deletes', async () => {
    await storage.put({ key: 'avatar/a.png', body: Buffer.from('hello'), contentType: 'image/png' })
    expect(await read(await storage.get('avatar/a.png'))).toBe('hello')
    await storage.delete('avatar/a.png')
    await expect(storage.get('avatar/a.png')).rejects.toThrow()
  })

  it('never leaves its root', async () => {
    await expect(storage.put({ key: '../escape.txt', body: Buffer.from('x'), contentType: 'text/plain' })).rejects.toThrow(/Invalid storage key/)
    await expect(storage.get('../../etc/passwd')).rejects.toThrow(/Invalid storage key/)
  })
})
