import { statfs } from 'node:fs/promises'
import * as Minio from 'minio'
import type { BackupSnapshot, BackupStatus } from '#contract/types.js'
import type { AgentConfig, S3Target } from './config.js'

// What is in the backup buckets: the dumps on this machine's MinIO (`local`) and off-site, and whether
// each side answers. Read with the MinIO client (no mc needed), with the same logins as the scripts.

const DUMP = /^db\/(.+-\d{8}-\d{6}\.archive\.gz)$/

export interface DumpObject {
  name: string
  size: number
  lastModified: Date
  lockedUntil?: string
}

/** lists and checks one side; tests replace it */
export interface BucketSide {
  ping(): Promise<void>
  dumps(): Promise<DumpObject[]>
}

export function minioSide(target: S3Target, bucket: string): BucketSide {
  const url = new URL(target.url)
  const useSSL = url.protocol === 'https:'
  const client = new Minio.Client({
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : useSSL ? 443 : 80,
    useSSL,
    accessKey: target.accessKey,
    secretKey: target.secretKey,
  })
  return {
    async ping() {
      if (!(await client.bucketExists(bucket))) throw new Error(`ไม่มี bucket ${bucket} (รัน backup.sh init)`)
    },
    async dumps() {
      const items: DumpObject[] = []
      for await (const item of client.listObjectsV2(bucket, 'db/', true)) {
        const m = item.name ? DUMP.exec(item.name) : null
        if (!m || !item.name) continue
        const retention = await client.getObjectRetention(bucket, item.name).catch(() => null)
        items.push({
          name: m[1]!,
          size: item.size,
          lastModified: item.lastModified,
          ...(retention?.retainUntilDate ? { lockedUntil: new Date(retention.retainUntilDate).toISOString() } : {}),
        })
      }
      return items
    },
  }
}

export class Storage {
  readonly local: BucketSide
  readonly offsite: BucketSide | null

  constructor(config: AgentConfig, sides?: { local: BucketSide; offsite: BucketSide | null }) {
    const { local, offsite, backupBucket } = config.storage
    this.local = sides?.local ?? minioSide(local, backupBucket)
    this.offsite = sides ? sides.offsite : offsite ? minioSide(offsite, backupBucket) : null
  }

  /** every dump on either side, newest first; a side that does not answer adds nothing */
  async snapshots(): Promise<BackupSnapshot[]> {
    const [here, there] = await Promise.all([this.local.dumps().catch(() => []), this.offsite?.dumps().catch(() => []) ?? []])
    const byName = new Map<string, BackupSnapshot>()
    const add = (item: DumpObject, side: 'local' | 'offsite') => {
      const seen = byName.get(item.name)
      const lockedUntil = [seen?.lockedUntil, item.lockedUntil].filter(Boolean).sort()[0]
      byName.set(item.name, {
        name: item.name,
        createdAt: seen && Date.parse(seen.createdAt) < item.lastModified.getTime() ? seen.createdAt : item.lastModified.toISOString(),
        sizeBytes: Math.max(seen?.sizeBytes ?? 0, item.size),
        local: (seen?.local ?? false) || side === 'local',
        offsite: (seen?.offsite ?? false) || side === 'offsite',
        ...(lockedUntil ? { lockedUntil } : {}),
      })
    }
    here.forEach((item) => add(item, 'local'))
    there.forEach((item) => add(item, 'offsite'))
    return [...byName.values()].sort((a, b) => b.name.localeCompare(a.name))
  }

  async destinations(): Promise<BackupStatus['destinations']> {
    const check = async (id: 'local' | 'offsite', label: string, side: BucketSide) => {
      try {
        await side.ping()
        return { id, label, ok: true }
      } catch (err) {
        return { id, label, ok: false, message: (err as Error).message }
      }
    }
    return Promise.all([
      check('local', 'MinIO บนเครื่องนี้', this.local),
      ...(this.offsite ? [check('offsite', 'MinIO off-site (mirror)', this.offsite)] : []),
    ])
  }
}

/** how full the disk the agent works on is */
export async function diskUsage(path: string): Promise<{ usedPercent: number; freeBytes: number }> {
  const s = await statfs(path)
  const total = s.blocks * s.bsize
  const free = s.bavail * s.bsize
  return { usedPercent: total ? Math.round(((total - free) / total) * 100) : 0, freeBytes: free }
}
