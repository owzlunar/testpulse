import type { Readable } from 'node:stream'
import type { UploadedFile } from '#contract/types.js'
import type { Principal } from '#core/auth/principal.js'
import { config } from '#core/config/env.js'
import { logger } from '#core/config/logger.js'
import { newId } from '#core/database/ids.js'
import { ApiError } from '#core/http/errors.js'
import { storage } from '#core/storage/index.js'
import { detectImage } from './file-type.js'
import type { FileCategory } from './file.model.js'
import { fileRepository } from './file.repository.js'

export type { FileCategory }

export interface Upload {
  buffer: Buffer
  originalName: string
}

const urlOf = (id: string) => `${config.basePath}/files/${id}/content`

const toUploaded = (f: { _id: string; name: string; contentType: string; size: number }): UploadedFile => ({
  id: f._id,
  url: urlOf(f._id),
  name: f.name,
  contentType: f.contentType,
  size: f.size,
})

/** avatars: anyone signed in; project logos: the Admin (who manages projects) */
function assertMayUpload(principal: Principal, category: FileCategory) {
  if (category === 'project-logo' && !principal.isAdmin) throw ApiError.forbidden('เฉพาะ Admin เท่านั้น')
}

export const fileService = {
  /** stores an image; the file record is saved only after the bytes are (no record without a file) */
  async upload(principal: Principal, category: FileCategory, upload: Upload): Promise<UploadedFile> {
    assertMayUpload(principal, category)
    const type = detectImage(upload.buffer)
    if (!type) throw ApiError.unprocessable('รองรับเฉพาะรูปภาพ PNG, JPEG, GIF หรือ WebP')
    const id = newId('file')
    const key = `${category}/${id}.${type.extension}`
    await storage().put({ key, body: upload.buffer, contentType: type.contentType })
    try {
      const file = await fileRepository.create({
        _id: id,
        category,
        key,
        name: upload.originalName.slice(0, 255) || `upload.${type.extension}`,
        contentType: type.contentType,
        size: upload.buffer.length,
        uploadedBy: principal.id,
      })
      return toUploaded(file)
    } catch (err) {
      // undo the stored bytes so no orphan file is left behind
      await storage()
        .delete(key)
        .catch((e: Error) => logger.warn(`[file] orphan ${key} not removed: ${e.message}`))
      throw err
    }
  },

  /** logos and avatars are shown in <img> tags, so their content is public (by unguessable-enough id) */
  async open(id: string): Promise<{ stream: Readable; contentType: string; size: number }> {
    const file = await fileRepository.findById(id)
    if (!file) throw ApiError.notFound('ไม่พบไฟล์')
    return { stream: await storage().get(file.key), contentType: file.contentType, size: file.size }
  },
}
