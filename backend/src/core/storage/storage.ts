import type { Readable } from 'node:stream'

// Where uploaded files live. The file module stores metadata in MongoDB and the bytes through an
// adapter, chosen by STORAGE_DRIVER (local disk or MinIO / S3).

export interface PutObject {
  key: string
  body: Buffer
  contentType: string
}

export interface StorageAdapter {
  readonly driver: 'local' | 'minio'
  /** start-up check (e.g. create the bucket) */
  init(): Promise<void>
  put(object: PutObject): Promise<void>
  get(key: string): Promise<Readable>
  delete(key: string): Promise<void>
}
