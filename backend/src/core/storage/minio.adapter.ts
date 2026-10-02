import type { Readable } from 'node:stream'
import { Client } from 'minio'
import { logger } from '../config/logger.js'
import type { PutObject, StorageAdapter } from './storage.js'

export interface MinioOptions {
  endPoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  bucket: string
}

export class MinioStorageAdapter implements StorageAdapter {
  readonly driver = 'minio' as const
  private readonly client: Client

  constructor(private readonly options: MinioOptions) {
    const { bucket: _bucket, ...connection } = options
    this.client = new Client(connection)
  }

  async init(): Promise<void> {
    if (!(await this.client.bucketExists(this.options.bucket))) {
      await this.client.makeBucket(this.options.bucket)
      logger.info(`[storage] created bucket "${this.options.bucket}"`)
    }
  }

  async put({ key, body, contentType }: PutObject): Promise<void> {
    await this.client.putObject(this.options.bucket, key, body, body.length, { 'Content-Type': contentType })
  }

  get(key: string): Promise<Readable> {
    return this.client.getObject(this.options.bucket, key)
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.options.bucket, key)
  }
}
